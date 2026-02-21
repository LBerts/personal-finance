'use strict';
var obsidian = require('obsidian');

const VIEW_TYPE = "financas-overview";
const DEFAULT_SETTINGS = { dataFilePath: "personal-finance.csv", currency: "BRL", locale: "pt-BR" };

const CATEGORY_COLORS = [
  "#4f8ef7","#f76c6c","#43c59e","#f7b731","#a29bfe",
  "#fd79a8","#00cec9","#e17055","#6c5ce7","#fdcb6e",
  "#55efc4","#d63031","#0984e3","#e84393","#00b894",
];

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const fields = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  fields.push(current.trim());
  return fields;
}

function parseValue(str) {
  if (!str) return null;
  const cleaned = str.replace(/R\$\s*/g, "").replace(/"/g, "").trim().replace(/,/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function parseDate(str) {
  if (!str || !str.trim()) return null;
  const match = str.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  return isNaN(date.getTime()) ? null : date;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`;
}
function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = parseCSVLine(lines[0]).map(h =>
    h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );
  const idx = {
    data:         header.findIndex(h => h === "date"),
    categoria:    header.findIndex(h => h === "category"),
    subcategoria: header.findIndex(h => h === "sub-category"),
    descricao:    header.findIndex(h => h === "description"),
    valor:        header.findIndex(h => h === "amount"),
  };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const fields = parseCSVLine(line);
    const date = parseDate(idx.data >= 0 ? fields[idx.data] : "");
    if (!date) continue;
    const valor = idx.valor >= 0 ? parseValue(fields[idx.valor]) : null;
    if (valor === null) continue;
    rows.push({
      date,
      categoria:    (idx.categoria    >= 0 ? fields[idx.categoria]    : "") || "Sem categoria",
      subcategoria: (idx.subcategoria >= 0 ? fields[idx.subcategoria] : "") || "",
      descricao:    (idx.descricao    >= 0 ? fields[idx.descricao]    : "") || "",
      valor,
      isReceita: valor > 0,
    });
  }
  return rows;
}

// Formatação dinâmica baseada nas settings (chamada via plugin.settings)
let _formatSettings = { currency: "BRL", locale: "pt-BR" };
function setFormatSettings(s) { _formatSettings = s; }
function fmtBRL(value) {
  try {
    return Math.abs(value).toLocaleString(_formatSettings.locale, {
      style: "currency",
      currency: _formatSettings.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch(e) {
    return Math.abs(value).toLocaleString("pt-BR", { style:"currency", currency:"BRL", minimumFractionDigits:2 });
  }
}

// ─── View ─────────────────────────────────────────────────────────────────────
class FinancasView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.selectedMonth = null;
    this.allData = [];
    this.filterCategoria = "all";
    this.filterSubcategoria = "all";
  }

  getViewType()    { return VIEW_TYPE; }
  getDisplayText() { return "Personal Finance"; }
  getIcon()        { return "wallet"; }

  async onOpen()  { await this.render(); }
  async onClose() { this.contentEl.empty(); }

  async loadData() {
    const path = this.plugin.settings.dataFilePath;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof obsidian.TFile)) return [];
    const content = await this.app.vault.read(file);
    return parseCSV(content);
  }

  // Dados do mês selecionado, ANTES dos filtros (para montar as opções de filtro)
  getRawMonthData() {
    return this.allData.filter(r => monthKey(r.date) === this.selectedMonth);
  }

  // Dados filtrados (usados nos gráficos e tabelas)
  getFilteredData() {
    return this.getRawMonthData().filter(r => {
      if (this.filterCategoria !== "all" && r.categoria !== this.filterCategoria) return false;
      if (this.filterSubcategoria !== "all" && r.subcategoria !== this.filterSubcategoria) return false;
      return true;
    });
  }

  async render() {
    const el = this.contentEl;
    el.empty();
    el.addClass("financas-view");

    this.allData = await this.loadData();
    setFormatSettings(this.plugin.settings);
    if (this.allData.length === 0) { this.renderEmpty(el); return; }

    const months = [...new Set(this.allData.map(r => monthKey(r.date)))].sort();
    if (!this.selectedMonth || !months.includes(this.selectedMonth)) {
      this.selectedMonth = months[months.length - 1];
    }

    // Reset sub quando categoria muda
    const rawMonth = this.getRawMonthData();
    const validSubs = [...new Set(rawMonth
      .filter(r => this.filterCategoria === "all" || r.categoria === this.filterCategoria)
      .map(r => r.subcategoria).filter(Boolean))];
    if (this.filterSubcategoria !== "all" && !validSubs.includes(this.filterSubcategoria)) {
      this.filterSubcategoria = "all";
    }

    this.renderHeader(el, months, rawMonth);
    this.renderSummaryCards(el);
    this.renderBarChart(el, months);
    this.renderDailyChart(el);
    this.renderCategoryTable(el);
  }

  renderEmpty(el) {
    const wrap = el.createDiv("financas-empty");
    wrap.createEl("div", { cls: "financas-empty-icon", text: "🪙" });
    wrap.createEl("h2", { text: "CSV file not found" });
    const p = wrap.createEl("p");
    p.innerHTML = `Make sure the file exists at <code>${this.plugin.settings.dataFilePath}</code> (relative to your vault root).`;
    const btn = wrap.createEl("button", { cls: "financas-btn-primary", text: "⚙ Configure path" });
    btn.addEventListener("click", () => new SettingsModal(this.app, this.plugin, () => this.render()).open());
  }

  renderHeader(el, months, rawMonth) {
    const header = el.createDiv("financas-header");

    // Linha única: título + mês + filtros + botões
    const row1 = header.createDiv("financas-header-row");
    row1.createEl("h1", { text: "💰 Personal Finance", cls: "financas-title" });

    const controls = row1.createDiv("financas-controls");
    const selectMonth = controls.createEl("select", { cls: "financas-select" });
    months.forEach(m => {
      const opt = selectMonth.createEl("option", { value: m, text: monthLabel(m) });
      if (m === this.selectedMonth) opt.selected = true;
    });
    selectMonth.addEventListener("change", e => {
      this.selectedMonth = e.target.value;
      this.filterSubcategoria = "all";
      this.render();
    });

    const btnConfig = controls.createEl("button", { cls: "financas-btn-icon", title: "Settings" });
    btnConfig.textContent = "⚙";
    btnConfig.addEventListener("click", () => new SettingsModal(this.app, this.plugin, () => this.render()).open());

    const btnRefresh = controls.createEl("button", { cls: "financas-btn-icon", title: "Atualizar" });
    btnRefresh.textContent = "↻";
    btnRefresh.addEventListener("click", () => this.render());

    // Filtros inline na mesma linha
    const row2 = controls;

    const categorias = ["all", ...new Set(rawMonth.map(r => r.categoria))].sort((a, b) =>
      a === "all" ? -1 : b === "all" ? 1 : a.localeCompare(b)
    );
    const subcategorias = ["all", ...new Set(
      rawMonth
        .filter(r => this.filterCategoria === "all" || r.categoria === this.filterCategoria)
        .map(r => r.subcategoria).filter(Boolean)
    )].sort((a, b) => a === "all" ? -1 : b === "all" ? 1 : a.localeCompare(b));

    const mkFilter = (label, options, current, onChange) => {
      const wrap = row2.createDiv("financas-filter-wrap");
      wrap.createEl("label", { text: label, cls: "financas-filter-label" });
      const sel = wrap.createEl("select", { cls: "financas-select financas-select-sm" });
      options.forEach(opt => {
        const el = sel.createEl("option", { value: opt, text: opt === "all" ? "All" : opt });
        if (opt === current) el.selected = true;
      });
      sel.addEventListener("change", e => onChange(e.target.value));
    };

    mkFilter("Category:", categorias, this.filterCategoria, val => {
      this.filterCategoria = val;
      this.filterSubcategoria = "all";
      this.render();
    });

    if (subcategorias.length > 1) {
      mkFilter("Sub-category:", subcategorias, this.filterSubcategoria, val => {
        this.filterSubcategoria = val;
        this.render();
      });
    }

    // Badge de filtro ativo
    if (this.filterCategoria !== "all" || this.filterSubcategoria !== "all") {
      const badge = row2.createEl("button", { cls: "financas-filter-clear", text: "✕ Clear filters" });
      badge.addEventListener("click", () => {
        this.filterCategoria = "all";
        this.filterSubcategoria = "all";
        this.render();
      });
    }
  }

  renderSummaryCards(el) {
    const data = this.getFilteredData();
    const receitas = data.filter(r => r.valor > 0).reduce((s, r) => s + r.valor, 0);
    const despesas = data.filter(r => r.valor < 0).reduce((s, r) => s + Math.abs(r.valor), 0);
    const saldo    = receitas - despesas;

    const cards = el.createDiv("financas-cards");

    const mkCard = (label, value, cls, prefix = "") => {
      const card = cards.createDiv(`financas-card ${cls}`);
      card.createEl("div", { cls: "financas-card-label", text: label });
      card.createEl("div", { cls: "financas-card-value", text: `${prefix}${fmtBRL(value)}` });
    };

    mkCard("📈 Income", receitas, "card-receita");
    mkCard("📉 Expenses", despesas, "card-despesa");
    // Balance: show explicit "-" when negative
    mkCard(
      saldo >= 0 ? "🤑 Balance" : "🔴 Balance",
      Math.abs(saldo),
      saldo >= 0 ? "card-saldo-pos" : "card-saldo-neg",
      saldo < 0 ? "- " : ""
    );
  }

  // ── Gráfico diário (linha + área) ──────────────────────────────────────────
  renderDailyChart(el) {
    const data = this.getFilteredData();
    const section = el.createDiv("financas-section");
    section.createEl("h2", { cls: "financas-section-title", text: "Daily Balance" });

    // Agrupa despesas líquidas por dia
    const byDay = {};
    data.forEach(r => {
      const k = dayKey(r.date);
      if (!byDay[k]) byDay[k] = 0;
      byDay[k] += r.valor;
    });

    if (Object.keys(byDay).length === 0) {
      section.createEl("p", { cls: "financas-empty-msg", text: "No transactions found for this month." });
      return;
    }

    // Constrói série cumulativa dia a dia dentro do mês
    const [y, m] = this.selectedMonth.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let cumulative = 0;
    const points = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      if (byDay[k] !== undefined) cumulative += byDay[k];
      points.push({ day: d, value: cumulative, hasData: byDay[k] !== undefined });
    }

    // Corta os dias do futuro (sem dados ainda) — mantém até o último com dado
    const lastWithData = points.reduce((last, p, i) => p.hasData ? i : last, -1);
    const visiblePoints = lastWithData >= 0 ? points.slice(0, lastWithData + 1) : points;

    this.renderLineChart(section, visiblePoints, daysInMonth);
  }

  renderLineChart(container, points, daysInMonth) {
    const wrap = container.createDiv("financas-linechart-wrap");

    const W = 620, H = 200, PAD = { top: 20, right: 80, bottom: 32, left: 68 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const values = points.map(p => p.value);
    const minVal = Math.min(0, ...values);
    const maxVal = Math.max(0, ...values);
    const range  = maxVal - minVal || 1;

    const xScale = d => PAD.left + ((d - 1) / Math.max(daysInMonth - 1, 1)) * chartW;
    const yScale = v => PAD.top + chartH - ((v - minVal) / range) * chartH;
    const y0 = yScale(0);

    // Linha reta simples — sem curva, sem artefatos
    const linePath = points.map((p, i) =>
      `${i === 0 ? "M" : "L"}${xScale(p.day).toFixed(1)},${yScale(p.value).toFixed(1)}`
    ).join(" ");

    // Área até o zero
    const last = points[points.length - 1];
    const first = points[0];
    const areaPath = linePath
      + ` L${xScale(last.day).toFixed(1)},${y0.toFixed(1)}`
      + ` L${xScale(first.day).toFixed(1)},${y0.toFixed(1)} Z`;

    const lastVal = last.value;
    const isPos = lastVal >= 0;
    const colorMain = isPos ? "#43c59e" : "#f76c6c";
    const colorRGB  = isPos ? "67,197,158" : "247,108,108";
    const uid = this.selectedMonth;

    // Grade horizontal
    const gridLines = [];
    const nGrids = 4;
    for (let i = 0; i <= nGrids; i++) {
      const v  = minVal + (range / nGrids) * i;
      const yg = yScale(v);
      const lbl = Math.abs(v) >= 1000
        ? `${v < 0 ? "-" : ""}${(Math.abs(v)/1000).toFixed(1)}k`
        : `${v < 0 ? "-" : ""}${Math.round(Math.abs(v))}`;
      gridLines.push(`
        <line x1="${PAD.left}" y1="${yg.toFixed(1)}" x2="${W-PAD.right}" y2="${yg.toFixed(1)}"
              stroke="var(--background-modifier-border)" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>
        <text x="${(PAD.left-8)}" y="${(yg+4).toFixed(0)}"
              text-anchor="end" font-size="10" fill="var(--text-muted)">${lbl}</text>
      `);
    }

    // Labels eixo X
    const xLabels = [];
    for (let d = 1; d <= daysInMonth; d += 5) {
      xLabels.push(`
        <text x="${xScale(d).toFixed(1)}" y="${H - 8}"
              text-anchor="middle" font-size="10" fill="var(--text-muted)">${d}</text>
      `);
    }

    // Último ponto: coordenadas
    const lpx = parseFloat(xScale(last.day).toFixed(1));
    const lpy = parseFloat(yScale(lastVal).toFixed(1));

    // Label do último ponto (valor formatado + dia)
    const labelVal = fmtBRL(Math.abs(lastVal));
    const labelDay = `Day ${last.day}`;
    // Posiciona label à direita do ponto
    const labelX = lpx + 12;
    const labelY = lpy;

    const svg = `
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
           style="width:100%;height:auto;display:block;overflow:visible">
        <defs>
          <clipPath id="lc-clip-${uid}">
            <rect x="${PAD.left}" y="${PAD.top}" width="${chartW}" height="${chartH}"/>
          </clipPath>
          <linearGradient id="lc-grad-${uid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="rgb(${colorRGB})" stop-opacity="0.2"/>
            <stop offset="100%" stop-color="rgb(${colorRGB})" stop-opacity="0"/>
          </linearGradient>
          <filter id="lc-glow-${uid}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        ${gridLines.join("")}
        ${xLabels.join("")}

        <!-- Linha do zero -->
        ${minVal < 0 && maxVal > 0 ? `
        <line x1="${PAD.left}" y1="${y0.toFixed(1)}" x2="${W-PAD.right}" y2="${y0.toFixed(1)}"
              stroke="${colorMain}" stroke-width="1" opacity="0.25" stroke-dasharray="4,4"/>
        ` : ""}

        <!-- Área com gradiente -->
        <path d="${areaPath}" fill="url(#lc-grad-${uid})"
              clip-path="url(#lc-clip-${uid})"/>

        <!-- Linha limpa, sem glow -->
        <path d="${linePath}" fill="none" stroke="${colorMain}" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"
              clip-path="url(#lc-clip-${uid})"/>

        <!-- Ponto final com glow -->
        <circle cx="${lpx}" cy="${lpy}" r="10" fill="${colorMain}" opacity="0.12"
                filter="url(#lc-glow-${uid})"/>
        <circle cx="${lpx}" cy="${lpy}" r="5"  fill="${colorMain}"
                stroke="var(--background-primary)" stroke-width="2"/>

        <!-- Label do último ponto -->
        <text x="${labelX}" y="${(labelY - 6).toFixed(0)}"
              font-size="11" font-weight="600" fill="${colorMain}">${labelVal}</text>
        <text x="${labelX}" y="${(labelY + 8).toFixed(0)}"
              font-size="9" fill="var(--text-muted)">${labelDay}</text>
      </svg>
    `;

    wrap.innerHTML = svg;
  }

  // ── Gráfico de barras mensal ───────────────────────────────────────────────
  renderBarChart(el, months) {
    const section = el.createDiv("financas-section");
    section.createEl("h2", { cls: "financas-section-title", text: "Monthly Overview" });

    const chartWrap = section.createDiv("financas-chart-wrap");

    const monthTotals = months.map(m => {
      const mData = this.allData.filter(r => {
        if (monthKey(r.date) !== m) return false;
        if (this.filterCategoria !== "all" && r.categoria !== this.filterCategoria) return false;
        if (this.filterSubcategoria !== "all" && r.subcategoria !== this.filterSubcategoria) return false;
        return true;
      });
      const receitas = mData.filter(r => r.valor > 0).reduce((s, r) => s + r.valor, 0);
      const despesas = mData.filter(r => r.valor < 0).reduce((s, r) => s + Math.abs(r.valor), 0);
      return { month: m, receitas, despesas };
    });

    const maxVal = Math.max(...monthTotals.map(m => Math.max(m.receitas, m.despesas)), 1);
    const chart  = chartWrap.createDiv("financas-bar-chart");

    monthTotals.forEach(({ month, receitas, despesas }) => {
      const col = chart.createDiv("financas-bar-col");
      col.classList.toggle("active", month === this.selectedMonth);
      col.addEventListener("click", () => { this.selectedMonth = month; this.render(); });

      const bars = col.createDiv("financas-bars");
      const mkBar = (val, cls, label) => {
        const bar = bars.createDiv(`financas-bar ${cls}`);
        bar.style.height = `${Math.max((val / maxVal) * 100, 1)}%`;
        bar.title = label;
      };
      mkBar(receitas, "bar-receita", `Income: ${fmtBRL(receitas)}`);
      mkBar(despesas, "bar-despesa", `Expenses: ${fmtBRL(despesas)}`);
      col.createEl("div", { cls: "financas-bar-label", text: monthLabel(month) });
    });

    const legend = section.createDiv("financas-legend");
    [["bar-receita","Income"],["bar-despesa","Expenses"]].forEach(([cls, text]) => {
      const item = legend.createDiv("financas-legend-item");
      item.createDiv(`financas-legend-dot ${cls}`);
      item.createEl("span", { text });
    });
  }

  // ── Tabela por categoria com drill-down ──────────────────────────────────
  renderCategoryTable(el) {
    const data     = this.getFilteredData();
    const despesas = data.filter(r => r.valor < 0);
    const section  = el.createDiv("financas-section");
    section.createEl("h2", { cls: "financas-section-title", text: `Spending by Category — ${monthLabel(this.selectedMonth)}` });

    if (despesas.length === 0) {
      section.createEl("p", { cls: "financas-empty-msg", text: "No expenses found for this filter." });
      return;
    }

    // Agrupa: categoria → { total, subcategorias: { nome → total } }
    const byCategory = {};
    despesas.forEach(r => {
      if (!byCategory[r.categoria]) byCategory[r.categoria] = { total: 0, subs: {} };
      byCategory[r.categoria].total += Math.abs(r.valor);
      const subKey = r.subcategoria || r.descricao || "—";
      if (!byCategory[r.categoria].subs[subKey]) byCategory[r.categoria].subs[subKey] = 0;
      byCategory[r.categoria].subs[subKey] += Math.abs(r.valor);
    });

    const totalDespesas = Object.values(byCategory).reduce((s, v) => s + v.total, 0);
    const sorted = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);

    const table = section.createEl("table", { cls: "financas-table" });
    const thead = table.createEl("thead");
    const hrow  = thead.createEl("tr");
    ["", "Category", "Amount", "%", ""].forEach(h => hrow.createEl("th", { text: h }));

    const tbody = table.createEl("tbody");

    sorted.forEach(([cat, { total, subs }], idx) => {
      const pct        = totalDespesas > 0 ? (total / totalDespesas) * 100 : 0;
      const color      = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
      const subEntries = Object.entries(subs).sort((a, b) => b[1] - a[1]);
      const hasSubs    = subEntries.length > 1 || (subEntries.length === 1 && subEntries[0][0] !== "—");

      // Estado do drill-down (armazenado na própria linha via dataset)
      let expanded = false;

      // ── Linha da categoria ──
      const tr = tbody.createEl("tr", { cls: "financas-cat-row" });
      if (hasSubs) tr.addClass("financas-cat-expandable");

      // Chevron
      const tdChevron = tr.createEl("td", { cls: "financas-td-chevron" });
      const chevron = hasSubs ? tdChevron.createSpan({ cls: "financas-chevron", text: "▶" }) : null;

      const tdCat = tr.createEl("td");
      const dot = tdCat.createSpan({ cls: "financas-cat-dot" });
      dot.style.background = color;
      tdCat.createSpan({ text: cat });

      tr.createEl("td", { text: fmtBRL(total), cls: "financas-td-num" });
      tr.createEl("td", { text: `${pct.toFixed(1)}%`, cls: "financas-td-num" });

      const tdBar   = tr.createEl("td");
      const barWrap = tdBar.createDiv("financas-progress-wrap");
      const bar     = barWrap.createDiv("financas-progress-bar");
      bar.style.width    = `${pct}%`;
      bar.style.background = color;

      // ── Linhas de subcategoria (inicialmente ocultas) ──
      const subRows = [];
      if (hasSubs) {
        subEntries.forEach(([subName, subTotal]) => {
          const subPct = total > 0 ? (subTotal / total) * 100 : 0;
          const subTr  = tbody.createEl("tr", { cls: "financas-sub-row financas-sub-hidden" });

          subTr.createEl("td"); // espaço do chevron
          const tdSub = subTr.createEl("td", { cls: "financas-sub-name" });
          tdSub.createSpan({ cls: "financas-sub-indent", text: "└ " });
          tdSub.createSpan({ text: subName });

          subTr.createEl("td", { text: fmtBRL(subTotal), cls: "financas-td-num financas-sub-value" });
          subTr.createEl("td", { text: `${subPct.toFixed(1)}%`, cls: "financas-td-num financas-sub-value" });

          const tdSubBar   = subTr.createEl("td");
          const subBarWrap = tdSubBar.createDiv("financas-progress-wrap");
          const subBar     = subBarWrap.createDiv("financas-progress-bar");
          subBar.style.width      = `${subPct}%`;
          subBar.style.background = color;
          subBar.style.opacity    = "0.6";

          subRows.push(subTr);
        });

        // Toggle ao clicar na linha
        tr.addEventListener("click", () => {
          expanded = !expanded;
          chevron.textContent = expanded ? "▼" : "▶";
          tr.classList.toggle("financas-cat-expanded", expanded);
          subRows.forEach(r => r.classList.toggle("financas-sub-hidden", !expanded));
        });
      }
    });

    const tfoot = table.createEl("tfoot");
    const frow  = tfoot.createEl("tr", { cls: "financas-total-row" });
    frow.createEl("td");
    frow.createEl("td", { text: "Total" });
    frow.createEl("td", { text: fmtBRL(totalDespesas), cls: "financas-td-num" });
    frow.createEl("td", { text: "100%" });
    frow.createEl("td");
  }
}

// ─── Modal de configurações ───────────────────────────────────────────────────
class SettingsModal extends obsidian.Modal {
  constructor(app, plugin, onSave) { super(app); this.plugin = plugin; this.onSave = onSave; }

  onOpen() {
    this.titleEl.setText("⚙ Settings — Personal Finance");
    const { contentEl } = this;
    contentEl.addClass("financas-modal");

    // CSV path
    contentEl.createEl("p", { cls: "financas-setting-label", text: "CSV file path (relative to vault root):" });
    const inputPath = contentEl.createEl("input", { type: "text", cls: "financas-input", value: this.plugin.settings.dataFilePath });
    contentEl.createEl("p", { cls: "financas-hint", text: "Example: personal-finance.csv" });

    // Currency
    contentEl.createEl("p", { cls: "financas-setting-label", text: "Currency:" });
    const inputCurrency = contentEl.createEl("input", {
      type: "text", cls: "financas-input financas-input-sm",
      value: this.plugin.settings.currency
    });
    contentEl.createEl("p", { cls: "financas-hint", text: "ISO 4217 code — e.g. BRL, USD, EUR" });

    // Locale
    contentEl.createEl("p", { cls: "financas-setting-label", text: "Number format locale:" });
    const selLocale = contentEl.createEl("select", { cls: "financas-input financas-input-sm" });
    const locales = [
      ["pt-BR", "pt-BR — 1.234,56 (Brazil)"],
      ["en-US", "en-US — 1,234.56 (USA)"],
      ["en-GB", "en-GB — 1,234.56 (UK)"],
      ["de-DE", "de-DE — 1.234,56 (Germany)"],
      ["fr-FR", "fr-FR — 1 234,56 (France)"],
      ["es-ES", "es-ES — 1.234,56 (Spain)"],
    ];
    locales.forEach(([val, label]) => {
      const opt = selLocale.createEl("option", { value: val, text: label });
      if (val === this.plugin.settings.locale) opt.selected = true;
    });

    const btnRow = contentEl.createDiv("financas-modal-btns");
    const btnSave = btnRow.createEl("button", { cls: "financas-btn-primary", text: "Save" });
    btnSave.addEventListener("click", async () => {
      this.plugin.settings.dataFilePath = inputPath.value.trim();
      this.plugin.settings.currency     = inputCurrency.value.trim().toUpperCase() || "BRL";
      this.plugin.settings.locale       = selLocale.value;
      await this.plugin.saveSettings();
      this.close(); this.onSave();
    });
    btnRow.createEl("button", { cls: "financas-btn-secondary", text: "Cancel" })
      .addEventListener("click", () => this.close());
  }
  onClose() { this.contentEl.empty(); }
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const STYLES = `
.financas-view {
  padding: 0;
  margin-top: 0 !important;
  padding-top: 0 !important;
  overflow-y: auto;
  font-family: var(--font-interface);
}
/* O Obsidian injeta padding/margin em .view-content — zeramos aqui */
.view-content:has(.financas-view) {
  padding: 0 !important;
}

/* ── Header ── */
.financas-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.financas-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.financas-title {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-normal);
}

.financas-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.financas-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.financas-filter-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
}

.financas-filter-label {
  font-size: 0.78rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.financas-select {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  padding: 4px 10px;
  color: var(--text-normal);
  font-size: 0.85rem;
  cursor: pointer;
  max-width: 160px;
}

.financas-select-sm {
  font-size: 0.8rem;
  padding: 3px 8px;
  max-width: 140px;
}

.financas-filter-clear {
  background: rgba(247,108,108,0.12);
  color: #f76c6c;
  border: 1px solid rgba(247,108,108,0.3);
  border-radius: 99px;
  padding: 2px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.financas-filter-clear:hover { background: rgba(247,108,108,0.22); }

.financas-btn-icon {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  width: 30px; height: 30px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 1rem;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
  flex-shrink: 0;
}
.financas-btn-icon:hover { background: var(--background-modifier-hover); color: var(--text-normal); }

/* ── Cards ── */
.financas-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 16px 20px;
}

.financas-card {
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.financas-card-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.financas-card-value {
  font-size: 1.1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.card-receita   { background: rgba(67,197,158,0.12); border: 1px solid rgba(67,197,158,0.3); }
.card-receita .financas-card-value { color: #43c59e; }

.card-despesa   { background: rgba(247,108,108,0.12); border: 1px solid rgba(247,108,108,0.3); }
.card-despesa .financas-card-value { color: #f76c6c; }

.card-saldo-pos { background: rgba(79,142,247,0.12); border: 1px solid rgba(79,142,247,0.3); }
.card-saldo-pos .financas-card-value { color: #4f8ef7; }

.card-saldo-neg { background: rgba(247,108,108,0.12); border: 1px solid rgba(247,108,108,0.3); }
.card-saldo-neg .financas-card-value { color: #f76c6c; }

/* ── Sections ── */
.financas-section { padding: 0 20px 20px; }

.financas-section-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 10px;
  padding-top: 4px;
}

/* ── Gráfico de linha diário ── */
.financas-linechart-wrap {
  background: var(--background-secondary);
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 20px;
  overflow-x: auto;
}

/* ── Gráfico de barras mensal ── */
.financas-chart-wrap {
  background: var(--background-secondary);
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 20px;
  overflow-x: auto;
}

.financas-bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 140px;
  min-width: fit-content;
}

.financas-bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  padding: 4px 4px 0;
  border-radius: 6px;
  transition: background 0.15s;
  min-width: 44px;
}
.financas-bar-col:hover { background: var(--background-modifier-hover); }
.financas-bar-col.active {
  background: var(--background-modifier-hover);
  outline: 2px solid var(--interactive-accent);
  outline-offset: 2px;
}

.financas-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 100px;
}

.financas-bar {
  width: 16px;
  border-radius: 3px 3px 0 0;
  min-height: 2px;
}
.bar-receita { background: #43c59e; }
.bar-despesa { background: #f76c6c; }

.financas-bar-label {
  font-size: 0.66rem;
  color: var(--text-muted);
  text-align: center;
  white-space: nowrap;
}

.financas-legend { display: flex; gap: 14px; margin-top: 8px; }
.financas-legend-item { display: flex; align-items: center; gap: 5px; font-size: 0.76rem; color: var(--text-muted); }
.financas-legend-dot { width: 10px; height: 10px; border-radius: 3px; }

/* ── Tabela ── */
.financas-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.financas-table th {
  text-align: left; padding: 7px 10px;
  color: var(--text-muted); font-size: 0.73rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em;
  border-bottom: 1px solid var(--background-modifier-border);
}
.financas-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--background-modifier-border);
  color: var(--text-normal); vertical-align: middle;
}
.financas-table tbody tr:hover td { background: var(--background-modifier-hover); }
.financas-td-num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }

.financas-cat-dot {
  display: inline-block; width: 9px; height: 9px;
  border-radius: 50%; margin-right: 7px; vertical-align: middle;
}

.financas-progress-wrap {
  background: var(--background-modifier-border);
  border-radius: 99px; height: 5px; min-width: 60px; overflow: hidden;
}
.financas-progress-bar { height: 100%; border-radius: 99px; }

.financas-total-row td {
  font-weight: 700;
  border-top: 2px solid var(--background-modifier-border);
  border-bottom: none;
}

/* ── Empty ── */
.financas-empty { text-align: center; padding: 48px 20px; color: var(--text-muted); }
.financas-empty-icon { font-size: 3rem; margin-bottom: 12px; }
.financas-empty h2 { color: var(--text-normal); margin-bottom: 12px; }
.financas-empty pre {
  text-align: left; background: var(--background-secondary);
  padding: 12px; border-radius: 8px; font-size: 0.76rem;
  overflow-x: auto; margin: 0 auto 16px; max-width: 500px;
}
.financas-empty-msg { text-align: center; color: var(--text-muted); font-style: italic; padding: 12px; }

/* ── Buttons ── */
.financas-btn-primary {
  background: var(--interactive-accent); color: var(--text-on-accent);
  border: none; border-radius: 6px; padding: 8px 16px;
  font-size: 0.85rem; cursor: pointer; font-weight: 600; transition: opacity 0.15s;
}
.financas-btn-primary:hover { opacity: 0.85; }

.financas-btn-secondary {
  background: var(--background-secondary); color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px; padding: 8px 16px; font-size: 0.85rem; cursor: pointer;
}
.financas-btn-secondary:hover { background: var(--background-modifier-hover); }

/* ── Modal ── */
.financas-modal .financas-input {
  width: 100%; padding: 8px 12px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px; color: var(--text-normal);
  font-size: 0.9rem; margin-bottom: 6px; box-sizing: border-box;
}
.financas-hint { font-size: 0.76rem; color: var(--text-faint); margin-bottom: 12px; }
.financas-setting-label { font-size: 0.82rem; font-weight: 600; color: var(--text-normal); margin-bottom: 4px; }
.financas-input-sm { max-width: 160px; }
.financas-modal-btns { display: flex; gap: 8px; justify-content: flex-end; }

/* ── Drill-down categorias ── */
.financas-cat-expandable {
  cursor: pointer;
  user-select: none;
}
.financas-cat-expandable:hover td { background: var(--background-modifier-hover); }
.financas-cat-expanded td { background: var(--background-modifier-hover); }

.financas-td-chevron {
  width: 20px;
  padding-right: 0 !important;
  color: var(--text-faint);
  font-size: 0.6rem;
}

.financas-chevron {
  display: inline-block;
  transition: transform 0.18s ease;
  color: var(--text-muted);
  font-size: 0.6rem;
}

.financas-sub-row {
  background: var(--background-secondary);
}
.financas-sub-row td { border-bottom-color: transparent; padding-top: 6px; padding-bottom: 6px; }
.financas-sub-row:last-of-type td { border-bottom: 1px solid var(--background-modifier-border); }

.financas-sub-hidden { display: none; }

.financas-sub-name {
  color: var(--text-muted);
  font-size: 0.83rem;
}
.financas-sub-indent {
  color: var(--text-faint);
  margin-right: 2px;
}
.financas-sub-value {
  color: var(--text-muted);
  font-size: 0.83rem;
}

/* ── Mobile ── */
@media (max-width: 480px) {
  .financas-header { padding: 12px 14px 10px; }
  .financas-title { font-size: 1rem; }

  .financas-cards {
    grid-template-columns: 1fr 1fr;
    padding: 12px 14px;
    gap: 8px;
  }
  .financas-cards .financas-card:last-child { grid-column: span 2; }
  .financas-card-value { font-size: 0.95rem; }

  .financas-section { padding: 0 14px 16px; }

  .financas-select { max-width: 130px; font-size: 0.8rem; }
  .financas-select-sm { max-width: 110px; font-size: 0.76rem; }

  .financas-filter-label { display: none; }

  .financas-table { font-size: 0.78rem; }
  .financas-table th, .financas-table td { padding: 7px 6px; }

  /* Esconde coluna de barra de progresso no mobile */
  .financas-table th:last-child,
  .financas-table td:last-child { display: none; }
}
`;

// ─── Plugin principal ─────────────────────────────────────────────────────────
class FinancasPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();

    const style = document.createElement("style");
    style.textContent = STYLES;
    document.head.appendChild(style);
    this.register(() => style.remove());

    this.registerView(VIEW_TYPE, leaf => new FinancasView(leaf, this));
    this.addRibbonIcon("wallet", "Personal Finance", () => this.activateView());
    this.addCommand({ id: "open-financas", name: "Open Personal Finance", callback: () => this.activateView() });

    this.registerEvent(this.app.vault.on("modify", file => {
      if (file.path === this.settings.dataFilePath) this.refreshViews();
    }));
  }

  async onunload() { this.app.workspace.detachLeavesOfType(VIEW_TYPE); }

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) { this.app.workspace.revealLeaf(existing[0]); return; }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      leaf.view.render();
  }

  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); }
}

module.exports = FinancasPlugin;
