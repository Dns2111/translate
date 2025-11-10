/* ===========================
   Math-preserving core logic
   =========================== */
function extractSegments(text) {  // Logic mask công thức LaTeX, $...$, `...` (giữ nguyên từ mã trước)
    const segments = [];
    let t = text;
    t = t.replace(/\$\$[\s\S]*?\$\$/g, m => { const token = `[[MATH_${segments.length}]]`; segments.push(m); return token; });
    t = t.replace(/\\\[[\s\S]*?\\\]/g, m => { const token = `[[MATH_${segments.length}]]`; segments.push(m); return token; });
    t = t.replace(/\\\([\s\S]*?\\\)/g, m => { const token = `[[MATH_${segments.length}]]`; segments.push(m); return token; });
    t = t.replace(/\$[^$\n][^$]*?\$/g, m => { const token = `[[MATH_${segments.length}]]`; segments.push(m); return token; });
    t = t.replace(/`[^`]*`/g, m => { const token = `[[MATH_${segments.length}]]`; segments.push(m); return token; });
    // Mask toán học phức tạp
    t = t.replace(/([A-Za-z0-9_{}^_\\-]+(?:[_\^][A-Za-z0-9{}]+)+|[0-9]+(?:\.[0-9]+)?|→|⇒|≤|≥|π|∑|∫|√|∞|\b(?:sin|cos|tan|log|ln|exp|sqrt)\b|\S*[0-9]+\S*)/g, m => {
        if (m.length <= 1) return m;
        if (!(/[0-9=+\-*/^_{}<>%→⇒≤≥π∑∫√∞]|[_\^]/.test(m))) { return m; }
        const token = `[[MATH_${segments.length}]]`; segments.push(m); return token;
    });
    return { masked: t, segments: segments };
}

function restoreSegments(text, segments) {  // Logic restore (khôi phục)
    let out = text;
    segments.forEach((s, i) => { out = out.split(`[[MATH_${i}]]`).join(s); });
    return out;
}

/* ===========================
   Google Translate API (Public Endpoint)
   =========================== */
async function googleTranslate(text, from, to) {
    // Chức năng này sử dụng endpoint công cộng, có thể bị giới hạn/chặn
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Translate endpoint failed: ' + res.status);
    const data = await res.json();
    return data[0].map(item => item[0]).join('');
}

/* ===========================
   UI & Translator Logic
   =========================== */
const inputEl = document.getElementById('inputText');
const outputEl = document.getElementById('output');
const translateBtn = document.getElementById('translateBtn');
const clearBtn = document.getElementById('clearBtn');
const directionSel = document.getElementById('direction');

translateBtn.addEventListener('click', async () => {
    const inputText = inputEl.value || '';
    if (!inputText.trim()) { outputEl.innerText = 'Vui lòng nhập văn bản.'; return; }

    outputEl.innerText = 'Đang dịch...';
    try {
        // 1) Mask
        const { masked, segments } = extractSegments(inputText);
        const [from, to] = directionSel.value.split('-');

        // 2) Translate masked text
        const translatedMasked = await googleTranslate(masked, from, to);

        // 3) Restore segments
        const restored = restoreSegments(translatedMasked, segments);

        // 4) Display
        outputEl.innerText = restored;

    } catch (err) {
        outputEl.innerText = 'Lỗi dịch thuật: ' + (err.message || err) + '. Thử lại sau.';
    }
});

clearBtn.addEventListener('click', () => { inputEl.value = ''; outputEl.innerText = ''; });


/* ===========================
   UPLOAD FILE (DOCX / PDF / TXT)
   =========================== */
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');

uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    inputEl.value = "Đang đọc nội dung tệp...";

    // Tải nội dung tệp bất đồng bộ (Async)
    const fileContentPromise = new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async function (e) {
            try {
                if (ext === 'txt' || ext === 'md') {
                    resolve(e.target.result);
                } else if (ext === 'pdf') {
                    // Logic trích xuất PDF (cần import động pdf.min.mjs)
                    const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.mjs');
                    const pdfData = new Uint8Array(e.target.result);
                    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
                    let textContent = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        textContent += content.items.map(item => item.str).join(' ') + '\n';
                    }
                    resolve(textContent.trim());
                } else if (ext === 'docx') {
                    // Mammoth.js (đã được gọi trong HTML)
                    // Chuyển DOCX sang HTML, sau đó loại bỏ thẻ HTML để lấy văn bản thuần
                    const result = await mammoth.convertToHtml({ arrayBuffer: e.target.result });
                    const text = result.value.replace(/<[^>]+>/g, '');
                    resolve(text);
                } else {
                    reject(new Error('Định dạng tệp không hỗ trợ.'));
                }
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = () => reject(new Error('Lỗi khi đọc tệp tin.'));

        // Chọn phương thức đọc file phù hợp
        if (ext === 'txt' || ext === 'md') {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    });

    try {
        const text = await fileContentPromise;
        inputEl.value = text;

        // Tự động dịch sau khi tải file thành công
        translateBtn.click();

    } catch (err) {
        inputEl.value = 'Lỗi đọc tệp: ' + err.message;
        outputEl.innerText = '';
    }
});


/* ===========================
   DOWNLOAD FILE (DOCX / PDF)
   =========================== */
const exportBtn = document.getElementById('exportBtn');

// Helper để tạo HTML song ngữ
function buildBilingualHTML(originalText, translatedText) {
    const html = `
    <!doctype html><html><head><meta charset="utf-8"><title>Bản Dịch Khoa Học</title>
      <style>
        body{font-family:Arial, sans-serif;color:#000;margin:24px}
        .wrap{display:flex;gap:20px}
        .col{flex:1;min-width:0}
        h2{font-size:16px;margin:0 0 8px 0}
        pre{white-space:pre-wrap;font-size:14px;line-height:1.45; word-wrap: break-word;}
        .label{font-size:12px;color:#555;margin-bottom:6px}
      </style>
    </head>
    <body>
      <div style="display: flex; gap: 20px;">
        <div style="flex: 1; min-width: 0;">
          <div class="label">Original / Văn bản gốc</div>
          <pre>${escapeHtml(originalText)}</pre>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div class="label">Translation / Bản dịch</div>
          <pre>${escapeHtml(translatedText)}</pre>
        </div>
      </div>
    </body></html>`;
    return html;
}

function escapeHtml(s) {
    // Hàm này giúp bảo toàn ký tự toán học (như <, >) trong HTML
    return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[m]));
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

exportBtn.addEventListener('click', async () => {
    const original = inputEl.value || '';
    const translated = outputEl.innerText || '';
    if (!translated.trim()) { alert('Không có kết quả để xuất. Vui lòng dịch trước.'); return; }

    const html = buildBilingualHTML(original, translated);

    // Hỏi người dùng muốn tải định dạng nào
    const format = prompt("Bạn muốn tải về định dạng nào? (Gõ 'docx' hoặc 'pdf')", 'pdf');
    if (!format) return;

    if (format.toLowerCase() === 'docx') {
        // DOCX: Xuất dưới dạng HTML/MIME type để MS Word tự động nhập
        const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8' });
        triggerDownload(blob, 'Bản_Dịch_Khoa_Học.docx');
    } else if (format.toLowerCase() === 'pdf') {
        // PDF: Sử dụng thư viện html2pdf.js
        const temp = document.createElement('div');
        temp.style.position = 'fixed'; temp.style.left = '-10000px';
        temp.innerHTML = html;
        document.body.appendChild(temp);

        const opt = {
            margin: 12, filename: 'Bản_Dịch_Khoa_Học.pdf', image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        };

        html2pdf().set(opt).from(temp).save().then(() => {
            document.body.removeChild(temp);
        }).catch(err => {
            document.body.removeChild(temp);
            alert('Lỗi xuất PDF: ' + err);
        });
    } else {
        alert("Định dạng không hợp lệ. Vui lòng gõ 'docx' hoặc 'pdf'.");
    }
});