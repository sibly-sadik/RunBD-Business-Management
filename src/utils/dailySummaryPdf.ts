import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CallLog, ContentPost, Lead } from '../types';
import {
  FinalDailySummary,
  formatBdPhoneDisplay,
  formatTime,
} from './leadLogic';

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY?: number;
  };
}

function getCursorY(doc: JsPdfWithAutoTable, fallback: number): number {
  return (doc.lastAutoTable?.finalY ?? fallback) + 6;
}

export function buildFinalDailySummaryPdfDoc(
  summary: FinalDailySummary,
  dateCalls: CallLog[],
  dateLeads: Lead[],
  datePosts: ContentPost[]
): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as JsPdfWithAutoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  // Title Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('RunBD Business Management — Final Daily Summary', margin, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Report Date: ${summary.date} (Today-Only Scope)`, margin, 20.5);
  doc.text(`Printed: ${new Date().toLocaleString()}`, pageWidth - margin, 20.5, {
    align: 'right',
  });

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(margin, 23, pageWidth - margin, 23);

  // Executive KPIs Table
  autoTable(doc, {
    startY: 26,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { textColor: [15, 23, 42], fontSize: 9.5, fontStyle: 'bold' },
    head: [[
      `Total Calls (${summary.date})`,
      'Orders Confirmed',
      `Leads Collected (${summary.collectors.map((c) => c.collectorName).join(' + ')})`,
      'Kawsar Links Posted',
    ]],
    body: [[
      String(summary.agentTotals.callsMade),
      String(summary.agentTotals.orderConfirmed),
      `${summary.totalCollectedOnDate} (Assigned: ${summary.agentTotals.assignedLeads})`,
      `${summary.kawsar.facebookLinks + summary.kawsar.websiteLinks} (${summary.kawsar.facebookLinks} FB · ${summary.kawsar.websiteLinks} Web)`,
    ]],
  });

  // Section 1: Call Center Agents Performance
  let y = getCursorY(doc, 46);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Call Center Agents Performance (${summary.date})`, margin, y);

  autoTable(doc, {
    startY: y + 2.5,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { textColor: [15, 23, 42], fontSize: 8 },
    footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 },
    head: [[
      'Agent',
      'Assigned',
      'Calls',
      'Confirmed',
      'Interested',
      'Follow-up',
      'No Resp',
      'Cancelled',
      'Done',
      'Pending',
    ]],
    body: summary.agents.map((a) => [
      a.agentName,
      String(a.assignedLeads),
      String(a.callsMade),
      String(a.orderConfirmed),
      String(a.interested),
      String(a.followUp),
      String(a.noResponse),
      String(a.cancelled),
      String(a.done),
      String(a.pending),
    ]),
    foot: [[
      'TOTAL',
      String(summary.agentTotals.assignedLeads),
      String(summary.agentTotals.callsMade),
      String(summary.agentTotals.orderConfirmed),
      String(summary.agentTotals.interested),
      String(summary.agentTotals.followUp),
      String(summary.agentTotals.noResponse),
      String(summary.agentTotals.cancelled),
      String(summary.agentTotals.done),
      String(summary.agentTotals.pending),
    ]],
  });

  // Section 2: Data Collectors
  y = getCursorY(doc, y + 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(
    `Data Collectors — ${summary.collectors.map((c) => c.collectorName).join(', ')} (${summary.date})`,
    margin,
    y
  );

  autoTable(doc, {
    startY: y + 2.5,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { textColor: [15, 23, 42], fontSize: 8.5 },
    footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8.5 },
    head: [['Collector', `Leads Collected (${summary.date})`]],
    body: summary.collectors.map((c) => [c.collectorName, String(c.leadsCollectedOnDate)]),
    foot: [['TOTAL', String(summary.totalCollectedOnDate)]],
  });

  // Section 3: Content & Link Poster (Kawsar)
  y = getCursorY(doc, y + 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`Content & Link Poster — Kawsar (${summary.date})`, margin, y);

  autoTable(doc, {
    startY: y + 2.5,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { textColor: [15, 23, 42], fontSize: 8.5 },
    head: [['Total Entries', 'Facebook Links', 'Website Links']],
    body: [[
      String(summary.kawsar.entriesCount),
      String(summary.kawsar.facebookLinks),
      String(summary.kawsar.websiteLinks),
    ]],
  });

  // Section 4: Today's Work Activity
  y = getCursorY(doc, y + 20);
  if (y > 255) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`Calls Logged on ${summary.date} (${dateCalls.length})`, margin, y);

  autoTable(doc, {
    startY: y + 2.5,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { textColor: [15, 23, 42], fontSize: 7.5 },
    head: [['Time', 'Agent', 'Customer', 'Phone', 'Status', 'Notes']],
    body:
      dateCalls.length > 0
        ? dateCalls.map((c) => [
            formatTime(c.timestamp) || summary.date,
            c.agentName,
            c.customerName,
            formatBdPhoneDisplay(c.phone),
            c.newStatus,
            c.notes || '—',
          ])
        : [['—', '—', `No calls logged on ${summary.date}`, '—', '—', '—']],
  });

  y = getCursorY(doc, y + 20);
  if (y > 255) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`Leads Collected on ${summary.date} (${dateLeads.length})`, margin, y);

  autoTable(doc, {
    startY: y + 2.5,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { textColor: [15, 23, 42], fontSize: 7.5 },
    head: [['Time', 'Collector', 'Customer', 'Phone', 'Assigned Agent', 'Status']],
    body:
      dateLeads.length > 0
        ? dateLeads.map((l) => [
            formatTime(l.createdAt) || summary.date,
            l.collectorName,
            l.customerName,
            formatBdPhoneDisplay(l.phone),
            l.assignedAgentName ?? 'Unassigned',
            l.status,
          ])
        : [['—', '—', `No leads collected on ${summary.date}`, '—', '—', '—']],
  });

  y = getCursorY(doc, y + 20);
  if (y > 255) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`Kawsar Links Posted on ${summary.date} (${datePosts.length})`, margin, y);

  autoTable(doc, {
    startY: y + 2.5,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { textColor: [15, 23, 42], fontSize: 7.5 },
    head: [['Time', 'Title / Note', 'Facebook Link', 'Website Link']],
    body:
      datePosts.length > 0
        ? datePosts.map((p) => [
            formatTime(p.createdAt) || summary.date,
            p.note || 'Post Entry',
            p.facebookLink || '—',
            p.websiteLink || '—',
          ])
        : [['—', `No links posted on ${summary.date}`, '—', '—']],
  });

  return {
    doc,
    filename: `RunBD_Final_Daily_Summary_${summary.date}.pdf`,
  };
}

export function downloadFinalDailySummaryPdf(
  summary: FinalDailySummary,
  dateCalls: CallLog[],
  dateLeads: Lead[],
  datePosts: ContentPost[]
): string {
  const { doc, filename } = buildFinalDailySummaryPdfDoc(
    summary,
    dateCalls,
    dateLeads,
    datePosts
  );
  doc.save(filename);
  return filename;
}

export interface PrintAttemptResult {
  nativePrintTriggered: boolean;
  inIframe: boolean;
}

/**
 * Attempts browser native print and detects whether the current context (e.g. a sandboxed
 * iframe preview without `allow-modals`) blocked `window.print()`.
 */
export function attemptNativePrint(win: Window = window): PrintAttemptResult {
  let beforePrintFired = false;
  const onBeforePrint = () => {
    beforePrintFired = true;
  };
  const inIframe = (() => {
    try {
      return win.self !== win.top;
    } catch {
      return true;
    }
  })();

  try {
    win.addEventListener('beforeprint', onBeforePrint, { once: true });
    win.print();
  } catch {
    // Blocked by sandboxed iframe or browser policy
  } finally {
    win.removeEventListener('beforeprint', onBeforePrint);
  }

  return {
    nativePrintTriggered: beforePrintFired && !inIframe,
    inIframe,
  };
}
