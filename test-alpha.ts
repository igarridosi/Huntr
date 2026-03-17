
import fs from 'fs';
fetch('https://www.alphavantage.co/query?function=EARNINGS&symbol=BABA&apikey=QEWDRV5495X77FGY')
  .then(res => res.json())
  .then(data => fs.writeFileSync('alpha-baba.json', JSON.stringify(data, null, 2)));

