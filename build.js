const fs = require('fs');
fs.rmSync('www', { recursive: true, force: true });
fs.mkdirSync('www');
['index.html', 'style.css', 'app.js', 'database.js', 'products.js', 'sales.js', 'stock.js', 'barcode.js', 'ui.js'].forEach(f => fs.copyFileSync(f, 'www/' + f));
console.log('www/ hazır');
