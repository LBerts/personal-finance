# 💰 Finanças Overview — Obsidian Plugin

Track and visualize your monthly finances directly in Obsidian — summary cards, daily balance chart, monthly evolution, and spending by category, all powered by a simple CSV file.

![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7c3aed?style=flat-square&logo=obsidian)

---

## ✨ Features

- **Summary cards** — Income, Expenses, and Balance for the selected month (negative balance shown in red with a `−` sign)
- **Daily balance chart** — cumulative line chart day by day, with colored area (green = positive, red = negative)
- **Monthly bar chart** — income × expenses across all months; click any bar to navigate to that month
- **Category breakdown table** — sorted by amount, with proportional progress bar and percentage
- **Category & sub-category filters** — filter the entire page simultaneously
- **Auto-refresh** — detects changes to the CSV and updates automatically
- **Mobile-friendly** — responsive layout for small screens

---

## 📋 CSV Format

The plugin reads a CSV file with the following columns (column names are case-insensitive):

| Column | Required | Example |
|---|---|---|
| `date` | ✅ | `2025-01-15` |
| `category` | ✅ | `Food` |
| `sub-category` | — | `Groceries` |
| `description` | — | `Weekly shopping` |
| `amount` | ✅ | `R$9,120.00` or `-200.00` |
| `accumulated-value` | — | ignored by the plugin |

- **Dates** must be in `YYYY-MM-DD` format
- **Positive values** = income; **negative values** = expenses
- Currency prefix (`R$`) and thousand separators are handled automatically
- Empty rows or rows without a valid date are silently ignored

**Minimal example:**

```csv
date,category,sub-category,description,amount,accumulated-value
2025-01-05,Salary,,January salary,R$9120.00,R$9120.00
2025-01-10,Food,Groceries,Weekly shopping,-R$350.00,R$8770.00
2025-01-15,Transport,Fuel,Gas station,-R$200.00,R$8570.00
```

---

## 🚀 Installation

### Via Community Plugins (recommended)

1. Open Obsidian → **Settings** → **Community plugins**
2. Click **Browse** and search for `Personal Finance`
3. Install and enable the plugin

### Manual

1. Download `main.js` and `manifest.json` from the [latest release](../../releases/latest)
2. Copy both files to `<vault>/.obsidian/plugins/personal-finance/`
3. Reload Obsidian and enable the plugin under **Settings → Community plugins**

---

## ⚙️ Configuration

1. Click the 💰 icon in the left ribbon (or open the Command Palette and run `Open Financial Overview`)
2. Click the **⚙** button in the top-right corner to set the path to your CSV file
3. The path is relative to the vault root

The default path is `personal-finance.csv` (vault root).

---

## 📸 Screenshots

> *(add screenshots here after the first release)*

---

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/YOUR_USER/personal-finance
cd personal-finance

# No dependencies — the plugin is plain CommonJS JavaScript
# Copy files to your vault to test:
cp main.js manifest.json <vault>/.obsidian/plugins/personal-finance/
```

To publish a new version:
1. Update `version` in `manifest.json` and `versions.json`
2. Create a Git tag matching the version exactly (e.g. `1.0.1`)
3. GitHub Actions will automatically create a release with the required files attached

---

## 📄 License

[MIT](LICENSE) © Lucas Berta
