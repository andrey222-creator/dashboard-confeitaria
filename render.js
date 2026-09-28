(async function(){
  const res = await fetch('data.json', { cache: 'no-store' });
  const d = await res.json();

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  document.getElementById('meta-periodo').innerHTML =
    `Semestre: ${esc(d.periodoLabel)}<br>Fonte: Oracle Arius (VENDAS_DIARIAS)`;

  // ---- KPIs ----
  const k = d.kpis;
  $('kpi-grid').innerHTML = `
    <div class="kpi">
      <div class="lbl">Faturamento do semestre</div>
      <div class="val">${esc(k.totalSemestreFmt)}</div>
      <div class="sub ${k.yoySemestre>=0?'good':'bad'}">${esc(k.yoySemestreFmt)} vs. mesmo semestre de ${new Date(d.geradoEm).getFullYear()-1}</div>
    </div>
    <div class="kpi">
      <div class="lbl">Semestre — ano anterior</div>
      <div class="val">${esc(k.totalSemestrePassadoFmt)}</div>
      <div class="sub">Mesmo período, 12 meses antes</div>
    </div>
    <div class="kpi">
      <div class="lbl">Variação ${esc(k.penultLabel)} → ${esc(k.ultLabel)}</div>
      <div class="val ${k.varUltPenult>=0?'':''}" style="${k.varUltPenult<0?'color:var(--bad)':'color:var(--good)'}">${esc(k.varUltPenultFmt)}</div>
      <div class="sub">${esc(k.totalPenultFmt)} → ${esc(k.totalUltFmt)}</div>
    </div>
    <div class="kpi">
      <div class="lbl">Maior fornecedor do semestre</div>
      <div class="val" style="font-size:1.15rem;">${k.maiorFornecedor?esc(k.maiorFornecedor.nome):'—'}</div>
      <div class="sub ${k.maiorFornecedor&&k.maiorFornecedor.cresc>=0?'good':'bad'}">${k.maiorFornecedor?esc(k.maiorFornecedor.crescFmt)+' (2ª metade vs 1ª)':''}</div>
    </div>`;

  // ---- Tabela fornecedores ----
  $('forn-thead').innerHTML = `<th>Fornecedor</th>${d.janelaLabels6.map(l=>`<th>${esc(l)}</th>`).join('')}<th>Cresc.</th>`;
  $('forn-tbody').innerHTML = d.fornecedores.map(f => `<tr><td>${esc(f.nome)}</td>${f.v.map(v=>`<td>${esc(v)}</td>`).join('')}<td><span class="tag ${f.crescCls}">${esc(f.crescFmt)}</span></td></tr>`).join('');
  $('forn-sub').textContent = `Confeitaria · semestre (${d.periodoLabel}) · ${d.fornecedores.length} fornecedores com faturamento relevante · crescimento = 2ª metade vs 1ª metade do semestre · ordenado por faturamento total`;

  // ---- Trend chart (SVG) ----
  const vals = d.trend.valores;
  const max = Math.max(...vals, 1);
  const n = vals.length;
  const plotW = 440, plotL = 60, plotR = 500, plotTop = 20, plotBot = 210;
  const barW = (plotR-plotL) / n * 0.55;
  const gap = (plotR-plotL) / n;
  function niceMax(m){ const p = Math.pow(10, Math.floor(Math.log10(m))); return Math.ceil(m/p)*p; }
  const axisMax = niceMax(max*1.05);
  function y(v){ return plotBot - (v/axisMax)*(plotBot-plotTop); }
  function fmtMi(v){ return (v/1e6).toFixed(2).replace('.',',')+'mi'; }
  let svg = `<g stroke="var(--border)" stroke-width="1"><line x1="${plotL}" y1="${plotTop}" x2="${plotL}" y2="${plotBot}"/><line x1="${plotL}" y1="${plotBot}" x2="${plotR}" y2="${plotBot}"/></g>`;
  svg += `<g font-family="Inter,sans-serif" font-size="10" fill="var(--ink-faint)">`;
  for (let i=0;i<=3;i++){ const v = axisMax*i/3; svg += `<text x="${plotL-6}" y="${y(v)+3}" text-anchor="end">${i===0?'0':fmtMi(v)}</text>`; }
  svg += `</g><g stroke="var(--border)" stroke-width="1" stroke-dasharray="2 4">`;
  for (let i=1;i<=3;i++){ const v = axisMax*i/3; svg += `<line x1="${plotL}" y1="${y(v)}" x2="${plotR}" y2="${y(v)}"/>`; }
  svg += `</g>`;
  vals.forEach((v,i) => {
    const cx = plotL + gap*i + gap/2;
    const x = cx - barW/2;
    const yTop = y(v);
    svg += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${(plotBot-yTop).toFixed(1)}" rx="4" fill="var(--accent)"/>`;
    svg += `<text x="${cx.toFixed(1)}" y="${(yTop-8).toFixed(1)}" text-anchor="middle" font-family="Sora,sans-serif" font-weight="700" font-size="12" fill="var(--ink)">${fmtMi(v)}</text>`;
    svg += `<text x="${cx.toFixed(1)}" y="${plotBot+18}" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" fill="var(--ink-soft)">${esc(d.trend.labels[i])}</text>`;
  });
  $('trend-svg').innerHTML = svg;

  let side = '';
  d.trend.labels.forEach((lbl,i) => {
    const v = vals[i];
    let deltaHtml = '';
    if (i>0) {
      const prev = vals[i-1];
      const pct = prev>0 ? (v-prev)/prev : 0;
      const cls = pct>=0?'good':'bad';
      const sign = pct>=0?'+':'';
      deltaHtml = ` <span class="tag ${cls} d">${sign}${(pct*100).toFixed(1).replace('.',',')}%</span>`;
    }
    side += `<div class="row"><span class="m">${esc(lbl)}</span><span class="v">R$ ${Math.round(v).toLocaleString('pt-BR')}${deltaHtml}</span></div>`;
  });
  side += `<div class="row"><span class="m">Total do semestre</span><span class="v">${esc(k.totalSemestreFmt)}</span></div>`;
  side += `<div class="row"><span class="m">Mesmo semestre, ano anterior</span><span class="v">${esc(k.totalSemestrePassadoFmt)} <span class="tag ${k.yoySemestre>=0?'good':'bad'} d">${esc(k.yoySemestreFmt)}</span></span></div>`;
  $('trend-side').innerHTML = side;

  // ---- Seção / grupo ----
  $('secao-head').innerHTML = `<span>Seção / Grupo</span>${d.janelaLabels6.map(l=>`<span>${esc(l)}</span>`).join('')}<span>Tendência</span>`;
  $('secao-list').innerHTML = d.secoes.map(s => `
    <details class="secao-item">
      <summary><span class="sname"><i class="arrow">&#9656;</i> ${esc(s.nome)}</span>${s.vals.map(v=>`<span class="sval">${esc(v)}</span>`).join('')}<span class="tag ${s.tendencia.c}">${esc(s.tendencia.t)}</span></summary>
      <div class="grp-wrap"><table class="grp-table"><tbody>
        ${s.grupos.map(g => `<tr><td>${esc(g.nome)}</td>${g.vals.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
    </details>`).join('');

  // ---- Movers ----
  function moverCard(title, color, items) {
    return `<div class="card mover-card"><h3 style="color:${color};">${title}</h3>${
      items.map(it => `
        <div class="mover-item">
          <div class="nm">${esc(it.nome)}</div><div class="fig" style="color:${color};">${esc(it.crescFmt)}</div>
          <div class="sub">${esc(it.de)} (1ª metade) → ${esc(it.para)} (2ª metade)</div>
          <div class="bar-track"><div class="bar-fill" style="width:${it.pct}%;background:${color};"></div></div>
        </div>`).join('') || '<div class="mover-item"><div class="sub">Sem dados suficientes.</div></div>'
    }</div>`;
  }
  $('forn-movers').innerHTML =
    moverCard('▲ Subindo', 'var(--good)', d.fornMovers.sobem) +
    moverCard('▼ Caindo', 'var(--bad)', d.fornMovers.caem);
  $('marca-movers').innerHTML =
    moverCard('▲ Subindo', 'var(--good)', d.marcaMovers.sobem) +
    moverCard('▼ Caindo', 'var(--bad)', d.marcaMovers.caem);

  document.getElementById('footer-text').innerHTML =
    `Fonte: Oracle Arius (PROREG.VENDAS_DIARIAS, join PROREG.PRODUTOS/DEPTOS por departamento, PRODUTOS_FORNECEDOR/FORNECEDORES e MARCAS_PRODUTOS). Exclui a loja Ribeirão Preto do comparativo. ` +
    `Consulta ao vivo ao Arius, sem valores fixos — janela de 6 meses completos (${esc(d.periodoLabel)}), sem mês corrente/projeção. ` +
    `Comparações de fornecedor/marca/seção usam 1ª metade vs 2ª metade do semestre. "Sicao" é marca (Barry Callebaut é o fornecedor cadastrado no Arius para a maior parte dos produtos dessa marca). ` +
    `Dados gerados em ${new Date(d.geradoEm).toLocaleString('pt-BR')}.`;
})().catch(e => {
  document.getElementById('kpi-grid').innerHTML = '<div class="loading">Erro ao carregar data.json: '+e.message+'</div>';
});
