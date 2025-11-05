

/* ===========================
   File upload & extract text
   =========================== */

const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');

uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  inputEl.value = "Loading file content... / Đang đọc nội dung tệp...";
  try {
    if (ext === 'txt' || ext === 'md') {
      const text = await file.text();
      inputEl.value = text;
    } else if (ext === 'pdf') {
      const reader = new FileReader();
      reader.onload = async function() {
        const pdfData = new Uint8Array(reader.result);
        const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.mjs');
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
        let textContent = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map(item => item.str).join(' ');
          textContent += strings + '\n';
        }
        inputEl.value = textContent.trim();
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === 'docx') {
      const reader = new FileReader();
      reader.onload = async function(e) {
        const arrayBuffer = e.target.result;
        const mammoth = await import('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/dist/mammoth.browser.min.js');
        const result = await mammoth.default.convertToHtml({ arrayBuffer });
        const text = result.value.replace(/<[^>]+>/g, '');
        inputEl.value = text;
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('Unsupported file format / Định dạng tệp không hỗ trợ.');
      inputEl.value = '';
    }
  } catch (err) {
    inputEl.value = 'Error reading file: ' + err.message;
  }
});