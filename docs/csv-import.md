# Transaction CSV import and export

CSV tools are available under **Settings → Data & privacy → Export data** on
web, Android, and iOS. Exported rows retain their original currency.

To import, paste CSV text in the import field and preview it. Each valid row can
be edited before saving. The importer uses the exported column names:

```csv
date,type,amount,currency,category,description,note
2026-11-01,expense,12.50,USD,Food,Coffee,
2026-11-02,income,2500.00,USD,Work,Paycheck,November
```

Dates use `YYYY-MM-DD`; types are `income`, `expense`, or `transfer`; amounts must be
positive decimal values; currency is a three-letter code. Choose a source
account with the same currency for each row, or set a default account for rows
without an `account_id`. Transfer rows also accept `to_account_id`,
`to_amount`, `to_currency`, and `exchange_rate`; cross-currency transfers need
a destination account and received amount. The importer shows up to 20 rows at
a time for review. Rows that fail basic CSV parsing need correction in the CSV
text before previewing again.

Each reviewed row receives a fingerprint based on its account, transaction
details, and date. Repeating the same import does not create a second
transaction. Each row commits independently, so a partial import can be
retried. Account balances update with the imported transaction, and import
counts and row errors appear in Recent import history.

The current workflow accepts pasted CSV text rather than selecting a file.
Original amounts and currencies are retained; mixed-currency totals remain
separate unless you enter a manual exchange rate.
