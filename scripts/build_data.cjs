// Consulta real ao Arius (2 anos) para o dashboard Confeitaria -- SEMESTRE,
// sem mes corrente/projecao. Gera data.json a partir de
// PROREG.VENDAS_DIARIAS/PRODUTOS/DEPTOS/PRODUTOS_FORNECEDOR/FORNECEDORES/MARCAS_PRODUTOS.
const oracledb = require("oracledb");
const fs = require("fs");
const path = require("path");

const cfg = JSON.parse(fs.readFileSync("C:/Users/andrey.oliveira/Desktop/Comercial/MCP/.mcp.json", "utf8"));
const env = cfg.mcpServers["oracle-arius"].env;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
const DEPTO_CONFEITARIA = 1;
const EMPRESAS = [1, 4, 5, 6, 7]; // exclui 8 = Ribeirão Preto
const MESES_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function pad(n){ return String(n).padStart(2,"0"); }
function toISO(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function ymKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
function ymLabel(d){ return `${MESES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`; }
function addMonths(d, n){ return new Date(d.getFullYear(), d.getMonth()+n, 1); }
function fmtInt(n){ return Math.round(n).toLocaleString("pt-BR"); }
function fmtMoney(n){ return "R$ " + fmtInt(n); }
function fmtPct(n){ const s=(n*100).toFixed(1).replace(".",","); return (n>=0?"+":"")+s+"%"; }
function titleCase(s){ return s.toLowerCase().replace(/(^|\s)([a-zà-ú])/g,(m,sp,c)=>sp+c.toUpperCase()); }

async function withConn(fn){
  const conn = await oracledb.getConnection({ user: env.ARIUS_DB_USER, password: env.ARIUS_DB_PASSWORD, connectString: env.ARIUS_DB_CONNECT_STRING });
  try { return await fn(conn); } finally { await conn.close(); }
}

async function main(){
  const hoje = new Date();
  const curMonthStart = new Date(hoje.getFullYear(), hoje.getMonth(), 1); // mes corrente (parcial) -- EXCLUIDO
  // Semestre = 6 ultimos meses COMPLETOS, terminando no mes anterior ao corrente.
  const semStart = addMonths(curMonthStart, -6); // 1o dia do semestre
  const semEnd = curMonthStart;                  // exclusivo (inicio do mes corrente)
  const semStartPrevYear = addMonths(semStart, -12);
  const semEndPrevYear = addMonths(semEnd, -12);

  const mesesSemestre = [];
  for (let i=6;i>=1;i--) mesesSemestre.push(addMonths(curMonthStart, -i));
  const ymsSemestre = mesesSemestre.map(ymKey);
  const labelsSemestre = mesesSemestre.map(ymLabel);
  const mUlt = mesesSemestre[5], mPenult = mesesSemestre[4]; // ultimo mes completo e o anterior

  const out = await withConn(async (conn) => {
    const diarioSql = `
      SELECT TRUNC(vd.DATA,'MM') AS MES, SUM(vd.VALOR) AS VALOR
      FROM PROREG.VENDAS_DIARIAS vd
      JOIN PROREG.PRODUTOS p ON p.ID = vd.PRODUTO
      WHERE vd.EMPRESA IN (${EMPRESAS.join(",")})
        AND p.DEPTO = ${DEPTO_CONFEITARIA}
        AND vd.DATA >= TO_DATE(:ini,'YYYY-MM-DD') AND vd.DATA < TO_DATE(:fim,'YYYY-MM-DD')
      GROUP BY TRUNC(vd.DATA,'MM') ORDER BY 1`;
    const semestreRes = await conn.execute(diarioSql, { ini: toISO(semStart), fim: toISO(semEnd) }, { maxRows: 40 });
    const semestrePassadoRes = await conn.execute(diarioSql, { ini: toISO(semStartPrevYear), fim: toISO(semEndPrevYear) }, { maxRows: 40 });

    const fornSql = `
      SELECT f.DESCRITIVO AS FORNECEDOR, TRUNC(vd.DATA,'MM') AS MES, SUM(vd.VALOR) AS VALOR
      FROM PROREG.VENDAS_DIARIAS vd
      JOIN PROREG.PRODUTOS p ON p.ID = vd.PRODUTO
      JOIN PROREG.PRODUTOS_FORNECEDOR pf ON pf.PRODUTO = p.ID
      JOIN PROREG.FORNECEDORES f ON f.ID = pf.FORNECEDOR
      WHERE vd.EMPRESA IN (${EMPRESAS.join(",")})
        AND p.DEPTO = ${DEPTO_CONFEITARIA}
        AND vd.DATA >= TO_DATE(:ini,'YYYY-MM-DD') AND vd.DATA < TO_DATE(:fim,'YYYY-MM-DD')
      GROUP BY f.DESCRITIVO, TRUNC(vd.DATA,'MM')`;
    const fornRes = await conn.execute(fornSql, { ini: toISO(semStart), fim: toISO(semEnd) }, { maxRows: 20000 });

    const marcaSql = `
      SELECT mk.DESCRITIVO AS MARCA, TRUNC(vd.DATA,'MM') AS MES, SUM(vd.VALOR) AS VALOR
      FROM PROREG.VENDAS_DIARIAS vd
      JOIN PROREG.PRODUTOS p ON p.ID = vd.PRODUTO
      JOIN PROREG.MARCAS_PRODUTOS mk ON mk.ID = p.ID_MARCA_PRODUTO
      WHERE vd.EMPRESA IN (${EMPRESAS.join(",")})
        AND p.DEPTO = ${DEPTO_CONFEITARIA}
        AND vd.DATA >= TO_DATE(:ini,'YYYY-MM-DD') AND vd.DATA < TO_DATE(:fim,'YYYY-MM-DD')
      GROUP BY mk.DESCRITIVO, TRUNC(vd.DATA,'MM')`;
    const marcaRes = await conn.execute(marcaSql, { ini: toISO(semStart), fim: toISO(semEnd) }, { maxRows: 20000 });

    const secaoNomesRes = await conn.execute(`SELECT SECAO, DESCRITIVO FROM PROREG.DEPTOS WHERE DEPTO=${DEPTO_CONFEITARIA} AND GRUPO=0 AND SUBGRUPO=0 AND SECAO<>0`, {}, { maxRows: 200 });
    const grupoNomesRes = await conn.execute(`SELECT SECAO, GRUPO, DESCRITIVO FROM PROREG.DEPTOS WHERE DEPTO=${DEPTO_CONFEITARIA} AND GRUPO<>0 AND SUBGRUPO=0`, {}, { maxRows: 2000 });
    const secGrpSql = `
      SELECT p.SECAO AS SECAO, p.GRUPO AS GRUPO, TRUNC(vd.DATA,'MM') AS MES, SUM(vd.VALOR) AS VALOR
      FROM PROREG.VENDAS_DIARIAS vd
      JOIN PROREG.PRODUTOS p ON p.ID = vd.PRODUTO
      WHERE vd.EMPRESA IN (${EMPRESAS.join(",")})
        AND p.DEPTO = ${DEPTO_CONFEITARIA}
        AND vd.DATA >= TO_DATE(:ini,'YYYY-MM-DD') AND vd.DATA < TO_DATE(:fim,'YYYY-MM-DD')
      GROUP BY p.SECAO, p.GRUPO, TRUNC(vd.DATA,'MM')`;
    const secGrpRes = await conn.execute(secGrpSql, { ini: toISO(semStart), fim: toISO(semEnd) }, { maxRows: 5000 });

    return { semestreRes, semestrePassadoRes, fornRes, marcaRes, secaoNomesRes, grupoNomesRes, secGrpRes };
  });

  // ---- Totais mensais do semestre ----
  const mesesAtual = {};
  out.semestreRes.rows.forEach(r => { mesesAtual[ymKey(new Date(r.MES))] = Number(r.VALOR||0); });
  const totaisSemestre = ymsSemestre.map(ym => mesesAtual[ym] || 0);
  const totalSemestre = totaisSemestre.reduce((a,b)=>a+b,0);

  const totalSemestrePassado = out.semestrePassadoRes.rows.reduce((a,r)=>a+Number(r.VALOR||0),0);
  const yoySemestre = totalSemestrePassado>0 ? (totalSemestre-totalSemestrePassado)/totalSemestrePassado : 0;

  const totalUlt = mesesAtual[ymKey(mUlt)] || 0;
  const totalPenult = mesesAtual[ymKey(mPenult)] || 0;
  const varUltPenult = totalPenult>0 ? (totalUlt-totalPenult)/totalPenult : 0;

  // primeira metade x segunda metade do semestre (tendencia)
  const primeiraMetade = totaisSemestre.slice(0,3).reduce((a,b)=>a+b,0);
  const segundaMetade = totaisSemestre.slice(3,6).reduce((a,b)=>a+b,0);
  const varMetades = primeiraMetade>0 ? (segundaMetade-primeiraMetade)/primeiraMetade : 0;

  // ================= Fornecedores =================
  const fornMap = {};
  for (const r of out.fornRes.rows) {
    const nome = r.FORNECEDOR, ym = ymKey(new Date(r.MES)), val = Number(r.VALOR||0);
    fornMap[nome] = fornMap[nome] || {};
    fornMap[nome][ym] = (fornMap[nome][ym]||0) + val;
  }
  const fornecedores = Object.keys(fornMap).map(nome => {
    const v = ymsSemestre.map(ym => fornMap[nome][ym]||0);
    const total = v.reduce((a,b)=>a+b,0);
    const p1 = v.slice(0,3).reduce((a,b)=>a+b,0), p2 = v.slice(3,6).reduce((a,b)=>a+b,0);
    const cresc = p1>0 ? (p2-p1)/p1 : (p2>0?1:0);
    return { nome, v, total, ultimo: v[5], p1, p2, cresc };
  }).filter(f => f.total > 500).sort((a,b)=> b.total - a.total);

  const fornMovers = fornecedores.filter(f => (f.total/6) >= 20000).map(f => ({
    nome: f.nome, de: f.p1, para: f.p2, cresc: f.cresc
  }));
  const fornSobem = [...fornMovers].sort((a,b)=>b.cresc-a.cresc).slice(0,3);
  const fornCaem = [...fornMovers].sort((a,b)=>a.cresc-b.cresc).slice(0,3);
  const maiorFornecedor = fornecedores[0];

  // ================= Marcas =================
  const marcaMap = {};
  for (const r of out.marcaRes.rows) {
    const nome = r.MARCA || "(Sem marca)", ym = ymKey(new Date(r.MES)), val = Number(r.VALOR||0);
    marcaMap[nome] = marcaMap[nome] || {};
    marcaMap[nome][ym] = (marcaMap[nome][ym]||0) + val;
  }
  const marcas = Object.keys(marcaMap).map(nome => {
    const v = ymsSemestre.map(ym => marcaMap[nome][ym]||0);
    const total = v.reduce((a,b)=>a+b,0);
    const p1 = v.slice(0,3).reduce((a,b)=>a+b,0), p2 = v.slice(3,6).reduce((a,b)=>a+b,0);
    const cresc = p1>0 ? (p2-p1)/p1 : (p2>0?1:0);
    return { nome, v, total, p1, p2, cresc };
  }).filter(m => m.total > 500);
  const marcaMovers = marcas.filter(m => (m.total/6) >= 20000).map(m => ({ nome: m.nome, de: m.p1, para: m.p2, cresc: m.cresc }));
  const marcaSobem = [...marcaMovers].sort((a,b)=>b.cresc-a.cresc).slice(0,3);
  const marcaCaem = [...marcaMovers].sort((a,b)=>a.cresc-b.cresc).slice(0,3);
  const maiorMarca = [...marcas].sort((a,b)=>b.total-a.total)[0];

  // ================= Secao / Grupo (6 meses do semestre) =================
  const secaoNomes = {}; out.secaoNomesRes.rows.forEach(r => secaoNomes[r.SECAO] = r.DESCRITIVO);
  const grupoNomes = {}; out.grupoNomesRes.rows.forEach(r => grupoNomes[r.SECAO+"|"+r.GRUPO] = r.DESCRITIVO);
  const secaoTot = {}, grupoTot = {};
  for (const r of out.secGrpRes.rows) {
    const sec = r.SECAO, grp = r.GRUPO, ym = ymKey(new Date(r.MES)), val = Number(r.VALOR||0);
    secaoTot[sec] = secaoTot[sec] || {}; secaoTot[sec][ym] = (secaoTot[sec][ym]||0)+val;
    grupoTot[sec] = grupoTot[sec] || {}; grupoTot[sec][grp] = grupoTot[sec][grp] || {};
    grupoTot[sec][grp][ym] = (grupoTot[sec][grp][ym]||0)+val;
  }
  const secoes = Object.keys(secaoTot).map(s => {
    const nome = Number(s)===0 ? "(Sem seção)" : titleCase(secaoNomes[s]||("Seção "+s));
    const vals = ymsSemestre.map(ym => secaoTot[s][ym]||0);
    const tot = vals.reduce((a,b)=>a+b,0);
    const grupos = Object.keys(grupoTot[s]||{}).map(g => {
      const gnome = Number(g)===0 ? "(Sem grupo)" : titleCase(grupoNomes[s+"|"+g]||("Grupo "+g));
      const gvals = ymsSemestre.map(ym => (grupoTot[s][g]||{})[ym]||0);
      return { nome: gnome, vals: gvals, tot: gvals.reduce((a,b)=>a+b,0) };
    }).sort((a,b)=>b.tot-a.tot);
    const p1 = vals.slice(0,3).reduce((a,b)=>a+b,0), p2 = vals.slice(3,6).reduce((a,b)=>a+b,0);
    const pct = p1>0 ? (p2-p1)/p1 : 0;
    const tendencia = pct>0.03 ? {t:"recuperando",c:"good"} : pct<-0.03 ? {t:"caindo",c:"bad"} : {t:"estável",c:"warn"};
    return { nome, vals, tot, grupos, tendencia };
  }).sort((a,b)=>b.tot-a.tot);

  // ================= Monta JSON =================
  const data = {
    geradoEm: hoje.toISOString(),
    periodoLabel: `${labelsSemestre[0]} – ${labelsSemestre[5]}`,
    janelaLabels6: labelsSemestre,
    kpis: {
      totalSemestre, totalSemestreFmt: fmtMoney(totalSemestre),
      yoySemestre, yoySemestreFmt: fmtPct(yoySemestre),
      totalSemestrePassado, totalSemestrePassadoFmt: fmtMoney(totalSemestrePassado),
      totalUlt, totalUltFmt: fmtMoney(totalUlt), ultLabel: ymLabel(mUlt),
      totalPenult, totalPenultFmt: fmtMoney(totalPenult), penultLabel: ymLabel(mPenult),
      varUltPenult, varUltPenultFmt: fmtPct(varUltPenult),
      varMetades, varMetadesFmt: fmtPct(varMetades),
      maiorFornecedor: maiorFornecedor ? { nome: titleCase(maiorFornecedor.nome), cresc: maiorFornecedor.cresc, crescFmt: fmtPct(maiorFornecedor.cresc) } : null,
    },
    fornecedores: fornecedores.map(f => ({
      nome: f.nome, v: f.v.map(fmtInt), crescFmt: fmtPct(f.cresc),
      crescCls: f.cresc>0.02?"good":(f.cresc<-0.02?"bad":"warn")
    })),
    fornMovers: { sobem: fornSobem.map(f=>({nome:titleCase(f.nome),crescFmt:fmtPct(f.cresc),de:fmtMoney(f.de),para:fmtMoney(f.para),pct:Math.min(100,Math.round(Math.abs(f.cresc)*100))})),
                  caem: fornCaem.map(f=>({nome:titleCase(f.nome),crescFmt:fmtPct(f.cresc),de:fmtMoney(f.de),para:fmtMoney(f.para),pct:Math.min(100,Math.round(Math.abs(f.cresc)*100))})) },
    marcaMovers: { sobem: marcaSobem.map(m=>({nome:titleCase(m.nome),crescFmt:fmtPct(m.cresc),de:fmtMoney(m.de),para:fmtMoney(m.para),pct:Math.min(100,Math.round(Math.abs(m.cresc)*100))})),
                   caem: marcaCaem.map(m=>({nome:titleCase(m.nome),crescFmt:fmtPct(m.cresc),de:fmtMoney(m.de),para:fmtMoney(m.para),pct:Math.min(100,Math.round(Math.abs(m.cresc)*100))})) },
    maiorMarca: maiorMarca ? { nome: titleCase(maiorMarca.nome), totalFmt: fmtInt(maiorMarca.total) } : null,
    secoes: secoes.map(s => ({
      nome: s.nome, vals: s.vals.map(fmtInt), tendencia: s.tendencia,
      grupos: s.grupos.map(g => ({ nome: g.nome, vals: g.vals.map(fmtInt) }))
    })),
    trend: { labels: labelsSemestre, valores: totaisSemestre }
  };

  const outDir = path.join(__dirname, "..");
  fs.writeFileSync(path.join(outDir, "data.json"), JSON.stringify(data, null, 0), "utf8");
  console.error("data.json gerado (SEMESTRE, sem projecao). Periodo:", data.periodoLabel,
    "| Total semestre:", data.kpis.totalSemestreFmt, "YoY:", data.kpis.yoySemestreFmt,
    "| Fornecedores:", data.fornecedores.length, "Secoes:", data.secoes.length);
}
main().catch(e => { console.error("ERRO:", e); process.exit(1); });
