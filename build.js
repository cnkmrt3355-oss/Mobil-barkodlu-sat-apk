const fs = require('fs');
fs.rmSync('www', { recursive: true, force: true });
fs.mkdirSync('www');
['index.html', 'style.css', 'app.js', 'database.js', 'products.js', 'sales.js', 'stock.js', 'barcode.js', 'ui.js', 'backup.js', 'held.js', 'credit.js', 'cash.js', 'labels.js', 'theme.js'].forEach(f => fs.copyFileSync(f, 'www/' + f));
console.log('www/ hazır');
