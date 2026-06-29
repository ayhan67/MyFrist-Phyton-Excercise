
const s = 'özbaşlar';
const u = s.toLocaleUpperCase('tr-TR');
console.log('Original:', s);
console.log('Upper:', u);
console.log('Different:', s !== u);

const s2 = 'ÖZBAŞLAR';
const u2 = s2.toLocaleUpperCase('tr-TR');
console.log('Original 2:', s2);
console.log('Upper 2:', u2);
console.log('Different 2:', s2 !== u2);

const s3 = 'ahmet';
const u3 = s3.toLocaleUpperCase('tr-TR');
console.log('Original 3:', s3);
console.log('Upper 3:', u3);
console.log('Different 3:', s3 !== u3);
