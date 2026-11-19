function escapeCsv(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsvFile(filename, headers, rows) {
  const csvLines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(','))
  ];
  // UTF-8 BOM ensures Microsoft Excel opens Indian symbols and text cleanly
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
    type: 'text/csv;charset=utf-8;'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportSalesGstrCsv(orders, gstRate = 5) {
  const paidOrders = orders.filter((o) => o.paid && o.status !== 'Cancelled');
  if (paidOrders.length === 0) {
    alert('No settled orders available to export yet.');
    return;
  }

  const headers = [
    'Order_ID',
    'Date_IST',
    'Table_No',
    'Customer_Name',
    'Customer_Phone',
    'Items_Summary',
    'Taxable_Value_INR',
    'CGST_INR',
    'SGST_INR',
    'Invoice_Total_INR',
    'Recipe_COGS_INR',
    'Gross_Profit_INR',
    'Payment_Mode'
  ];

  const rows = paidOrders.map((ord) => {
    const items = ord.items || [];
    const taxable = items.reduce(
      (sum, i) => sum + Number(i.price || 0) * Number(i.qty || 0),
      0
    );
    const cogs = items.reduce(
      (sum, i) => sum + Number(i.recipe_cost || 0) * Number(i.qty || 0),
      0
    );
    const totalGst = Number(((taxable * gstRate) / 100).toFixed(2));
    const halfGst = Number((totalGst / 2).toFixed(2));
    const invoiceTotal = Math.round(taxable + totalGst);

    const summary = items
      .map((i) => {
        const mods = i.selected_modifiers?.length
          ? ` [${i.selected_modifiers.join('+')}]`
          : '';
        return `${i.qty}x ${i.name}${mods}`;
      })
      .join(' | ');

    const dateStr = new Date(Number(ord.created_at)).toLocaleString('en-IN');

    return [
      ord.id,
      dateStr,
      ord.table_number,
      ord.customer_name || 'Guest',
      ord.customer_phone || '',
      summary,
      taxable,
      halfGst,
      halfGst,
      invoiceTotal,
      cogs,
      taxable - cogs,
      ord.payment_method || 'UPI'
    ];
  });

  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`cafe-gstr1-sales-${stamp}.csv`, headers, rows);
}

export function exportExpensesCsv(expenses) {
  if (!expenses || expenses.length === 0) {
    alert('No expenses recorded to export yet.');
    return;
  }

  const headers = [
    'Expense_ID',
    'Date_IST',
    'Title',
    'Category',
    'Vendor',
    'Payment_Mode',
    'Amount_INR'
  ];

  const rows = expenses.map((exp) => [
    exp.id,
    exp.created_at ? new Date(exp.created_at).toLocaleString('en-IN') : '',
    exp.title,
    exp.category,
    exp.vendor || '',
    exp.payment_mode || '',
    exp.amount
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`cafe-expenses-${stamp}.csv`, headers, rows);
}

export function buildWhatsAppBillUrl({
  phone,
  cafeName,
  tableNumber,
  guestNames,
  items,
  billing,
  discountPct,
  gstPct,
  paymentMethod,
  reviewLink
}) {
  const itemLines = items
    .map((item) => {
      const mods = item.selected_modifiers?.length
        ? ` (${item.selected_modifiers.join(', ')})`
        : '';
      return `• ${item.qty}x ${item.name}${mods} — ₹${Number(item.price) * Number(item.qty)}`;
    })
    .join('\n');

  const lines = [
    `*${cafeName.toUpperCase()} — Digital Bill*`,
    `Table #${tableNumber} | Guest: ${guestNames}`,
    `Date: ${new Date().toLocaleString('en-IN')}`,
    `----------------------------`,
    itemLines,
    `----------------------------`,
    `Subtotal: ₹${billing.subtotal}`,
    billing.discountAmt > 0 ? `Discount (${discountPct}%): -₹${billing.discountAmt}` : null,
    gstPct > 0 ? `GST (${gstPct}%): ₹${billing.gstAmt}` : null,
    `*Grand Total: ₹${billing.grandTotal}*`,
    `Payment Mode: ${paymentMethod}`,
    ``,
    `Thank you for visiting ${cafeName}!`,
    reviewLink?.trim() ? `Loved your coffee? Rate us here: ${reviewLink.trim()}` : null
  ].filter((line) => line !== null);

  const text = encodeURIComponent(lines.join('\n'));
  const digits = String(phone || '').replace(/\D/g, '');
  const fullNumber = digits.length === 10 ? `91${digits}` : digits;

  return fullNumber
    ? `https://wa.me/${fullNumber}?text=${text}`
    : `https://wa.me/?text=${text}`;
}