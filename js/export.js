/**
 * export.js - File Export and Document Sharing Utilities
 * 
 * Provides features for copy-to-clipboard, raw text file download,
 * structured text correction reports, and mobile Web Share sheet.
 */

export class Export {
  /**
   * Copy plain text to clipboard
   * @param {string} text - The raw text
   * @returns {Promise<boolean>} Success status
   */
  static async copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // Fallback below
      }
    }

    // Fallback: create temporary textarea
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed'; // Avoid scrolling to bottom
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      document.body.removeChild(textArea);
      return false;
    }
  }

  /**
   * Download text as a raw text file (.txt)
   * @param {string} text - File contents
   * @param {string} filename - Target file name
   */
  static downloadTxt(text, filename = 'dokumen-notered.txt') {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Download a structured correction report
   * @param {string} originalText - The original document text
   * @param {Array} corrections - Array of { word, type, suggestions }
   * @param {string} filename - Target file name
   */
  static downloadReport(originalText, corrections = [], filename = 'laporan-koreksi-notered.txt') {
    const dateStr = new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' });
    
    let report = `==================================================\n`;
    report += `    LAPORAN KOREKSI TULISAN - NOTERED             \n`;
    report += `    Dibuat pada: ${dateStr}                        \n`;
    report += `==================================================\n\n`;
    
    report += `--- Teks Asli ---\n`;
    report += originalText + `\n\n`;
    
    report += `--------------------------------------------------\n`;
    report += `--- Detail Koreksi Ejaan per Kata ---\n`;
    report += `--------------------------------------------------\n`;

    if (corrections.length === 0) {
      report += `Luar biasa! Tidak ditemukan kesalahan kata atau ketidakbakuan di dalam dokumen ini. meow~\n`;
    } else {
      corrections.forEach((c, idx) => {
        const typeLabel = c.type === 'tidak_baku' ? 'Kata Tidak Baku' : 'Salah Ejaan';
        report += `${idx + 1}. [${typeLabel}] "${c.word}"\n`;
        if (c.type === 'tidak_baku') {
          report += `   Saran Baku: ${c.suggestions.join(', ')}\n`;
        } else {
          report += `   Saran Alternatif: ${c.suggestions.length > 0 ? c.suggestions.join(', ') : '(Tidak ditemukan saran mirip)'}\n`;
        }
        report += `\n`;
      });
    }

    report += `==================================================\n`;
    report += `Notered - Asisten Menulis Bahasa Indonesia\n`;
    
    this.downloadTxt(report, filename);
  }

  /**
   * Share document via Web Share API
   * @param {string} text - Document text
   * @param {string} title - Share dialog title
   * @returns {Promise<boolean>} Success status
   */
  static async share(text, title = 'Notered Draft') {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: text
        });
        return true;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Share API failed:', err);
        }
      }
    }
    return false;
  }
}
