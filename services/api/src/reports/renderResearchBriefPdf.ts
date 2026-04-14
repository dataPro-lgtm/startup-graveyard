import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { countryLabel, industryLabel, primaryFailureReasonLabel } from '@sg/shared/taxonomy';
import type { ResearchBriefPayload } from './researchBrief.js';

type RenderResearchBriefPdfOptions = {
  ownerDisplayName?: string | null;
  shareUrl?: string | null;
};

const PAGE_MARGIN = 52;
const FOOTER_HEIGHT = 28;
const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/Library/Fonts/Arial Unicode.ttf',
  '/System/Library/Fonts/Hiragino Sans GB.ttc',
  '/System/Library/Fonts/Supplemental/Songti.ttc',
];

function resolveFont(): { body: string; heading: string } {
  const custom = FONT_CANDIDATES.find((fontPath) => fs.existsSync(fontPath));
  if (custom) {
    return { body: custom, heading: custom };
  }
  return { body: 'Helvetica', heading: 'Helvetica-Bold' };
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function baseUrlFromSourceViewUrl(sourceViewUrl: string): string {
  try {
    return new URL(sourceViewUrl).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

function bulletList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- N/A';
}

function sectionGap(doc: PDFKit.PDFDocument, amount = 12) {
  doc.moveDown(amount / 12);
}

function ensureSpace(doc: PDFKit.PDFDocument, minHeight: number) {
  const limit = doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT;
  if (doc.y + minHeight <= limit) return;
  doc.addPage();
}

function decoratePage(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  fonts: { body: string; heading: string },
) {
  doc.save();
  doc.font(fonts.body).fontSize(9).fillColor('#6b7fa8');
  doc.text('Startup Graveyard • Research Brief', PAGE_MARGIN, 24, {
    width: doc.page.width - PAGE_MARGIN * 2,
    align: 'left',
  });
  doc.text(`Page ${pageNumber}`, PAGE_MARGIN, doc.page.height - PAGE_MARGIN + 8, {
    width: doc.page.width - PAGE_MARGIN * 2,
    align: 'right',
  });
  doc
    .moveTo(PAGE_MARGIN, 42)
    .lineTo(doc.page.width - PAGE_MARGIN, 42)
    .strokeColor('#d9e1f2')
    .lineWidth(0.6)
    .stroke();
  doc.restore();
  doc.x = PAGE_MARGIN;
  doc.y = PAGE_MARGIN + 8;
}

function docBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

export async function renderResearchBriefPdf(
  brief: ResearchBriefPayload,
  options: RenderResearchBriefPdfOptions = {},
): Promise<Buffer> {
  const fonts = resolveFont();
  const appBaseUrl = baseUrlFromSourceViewUrl(brief.sourceViewUrl);
  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: PAGE_MARGIN,
      bottom: PAGE_MARGIN,
      left: PAGE_MARGIN,
      right: PAGE_MARGIN,
    },
    info: {
      Title: brief.title,
      Author: options.ownerDisplayName ?? 'Startup Graveyard',
      Subject: 'Startup failure research brief',
      Keywords: `startup graveyard, research brief, ${brief.title}`,
    },
  });

  let pageNumber = 1;
  decoratePage(doc, pageNumber, fonts);
  doc.on('pageAdded', () => {
    pageNumber += 1;
    decoratePage(doc, pageNumber, fonts);
  });

  const bufferPromise = docBuffer(doc);

  doc
    .font(fonts.heading)
    .fontSize(26)
    .fillColor('#10172b')
    .text(brief.title, {
      width: doc.page.width - PAGE_MARGIN * 2,
    });
  sectionGap(doc, 4);
  doc.font(fonts.body).fontSize(11).fillColor('#334155');
  doc.text(
    `Generated ${formatTimestamp(brief.generatedAt)}${options.ownerDisplayName ? ` • Shared by ${options.ownerDisplayName}` : ''}`,
    {
      width: doc.page.width - PAGE_MARGIN * 2,
    },
  );
  doc.text(`Source view: ${brief.sourceViewUrl}`, {
    width: doc.page.width - PAGE_MARGIN * 2,
    link: brief.sourceViewUrl,
    underline: true,
  });
  if (options.shareUrl) {
    doc.text(`Public brief: ${options.shareUrl}`, {
      width: doc.page.width - PAGE_MARGIN * 2,
      link: options.shareUrl,
      underline: true,
    });
  }

  sectionGap(doc, 10);
  doc.font(fonts.heading).fontSize(16).fillColor('#10172b').text('Filter Summary');
  doc
    .font(fonts.body)
    .fontSize(11)
    .fillColor('#334155')
    .text(bulletList(brief.filterSummary), {
      width: doc.page.width - PAGE_MARGIN * 2,
    });

  ensureSpace(doc, 120);
  sectionGap(doc, 10);
  doc.font(fonts.heading).fontSize(16).fillColor('#10172b').text('Snapshot');
  doc.font(fonts.body).fontSize(11).fillColor('#334155');
  doc.text(`- Total matching cases: ${brief.totalMatchingCases}`);
  doc.text(`- Sample included in this brief: ${brief.sampleSize}`);
  doc.text(`- Funding represented in sample: ${formatUsd(brief.sampleFundingUsd)}`);
  doc.text(`- Top industries in sample: ${brief.topIndustries.join(', ') || 'N/A'}`);
  doc.text(`- Top failure reasons in sample: ${brief.topFailureReasons.join(', ') || 'N/A'}`);

  ensureSpace(doc, 110);
  sectionGap(doc, 10);
  doc.font(fonts.heading).fontSize(16).fillColor('#10172b').text('Briefing Notes');
  doc.font(fonts.body).fontSize(11).fillColor('#334155');
  doc.text(
    'This PDF is generated from a saved research view. It captures the current filter scope, a sample snapshot, and representative cases so the brief can be shared with clients, collaborators, or investment committees without exposing the full product UI.',
    {
      width: doc.page.width - PAGE_MARGIN * 2,
      lineGap: 2,
    },
  );

  ensureSpace(doc, 140);
  sectionGap(doc, 10);
  doc.font(fonts.heading).fontSize(16).fillColor('#10172b').text('Representative Cases');

  for (const [index, item] of brief.cases.entries()) {
    ensureSpace(doc, 110);
    sectionGap(doc, 6);
    doc
      .font(fonts.heading)
      .fontSize(13)
      .fillColor('#10172b')
      .text(`${index + 1}. ${item.companyName}`);
    doc.font(fonts.body).fontSize(10.5).fillColor('#334155');
    const meta = [
      industryLabel(item.industry),
      item.country ? countryLabel(item.country) : null,
      item.closedYear ? String(item.closedYear) : null,
      item.primaryFailureReasonKey ? primaryFailureReasonLabel(item.primaryFailureReasonKey) : null,
    ]
      .filter(Boolean)
      .join(' • ');
    if (meta) {
      doc.text(meta, {
        width: doc.page.width - PAGE_MARGIN * 2,
      });
    }
    if (item.totalFundingUsd != null) {
      doc.text(`Funding: ${formatUsd(item.totalFundingUsd)}`);
    }
    doc.text(item.summary, {
      width: doc.page.width - PAGE_MARGIN * 2,
      lineGap: 2,
    });
    const caseUrl = `${appBaseUrl}/cases/s/${encodeURIComponent(item.slug)}`;
    doc.text(`Case URL: ${caseUrl}`, {
      width: doc.page.width - PAGE_MARGIN * 2,
      link: caseUrl,
      underline: true,
    });
    doc
      .moveTo(PAGE_MARGIN, doc.y + 8)
      .lineTo(doc.page.width - PAGE_MARGIN, doc.y + 8)
      .strokeColor('#d9e1f2')
      .lineWidth(0.5)
      .stroke();
    doc.y += 14;
  }

  doc.end();
  return bufferPromise;
}
