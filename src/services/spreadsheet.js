const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const ExcelJS = require('exceljs');

function extensionOf(filename) {
  return (filename.split('.').pop() || '').toLowerCase();
}

async function parseSpreadsheet(buffer, filename) {
  const ext = extensionOf(filename);

  if (ext === 'csv') {
    return parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    let headers = [];
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
      const values = row.values.slice(1);
      if (rowNumber === 1) {
        headers = values.map((v) => (v == null ? '' : v.toString().trim()));
        return;
      }
      const obj = {};
      headers.forEach((header, i) => {
        const cell = values[i];
        obj[header] = cell == null ? '' : cell.toString().trim();
      });
      rows.push(obj);
    });
    return rows;
  }

  throw new Error('Filformatet stöds inte. Använd en CSV- eller Excel-fil (.csv, .xlsx).');
}

function toCsv(rows, columns) {
  return stringify(rows, { header: true, columns });
}

async function toXlsxBuffer(rows, columns) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.addRows(rows);
  return workbook.xlsx.writeBuffer();
}

module.exports = { parseSpreadsheet, toCsv, toXlsxBuffer };
