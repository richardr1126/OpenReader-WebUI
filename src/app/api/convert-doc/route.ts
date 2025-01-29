import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import puppeteer from 'puppeteer';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Check if file is a Word document
    if (!file.name.endsWith('.doc') && !file.name.endsWith('.docx')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .doc and .docx files are supported' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const buffer = await file.arrayBuffer();

    // Convert Word to HTML using mammoth
    const result = await mammoth.convertToHtml({
      buffer: Buffer.from(buffer)
    });
    
    // Add CSS styling for better image handling
    const styledHtml = `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              margin: 0;
              padding: 20px;
            }
            img {
              max-width: 100%;
              height: auto;
              display: block;
              margin: 20px auto;
              object-fit: contain;
            }
            p {
              margin: 1em 0;
            }
          </style>
        </head>
        <body>
          ${result.value}
        </body>
      </html>
    `;

    // Convert HTML to PDF using Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(styledHtml, {
      waitUntil: 'networkidle0'
    });
    
    // Set viewport and PDF options for better image handling
    await page.setViewport({
      width: 1200,
      height: 1600,
      deviceScaleFactor: 2
    });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '40px',
        right: '40px',
        bottom: '40px',
        left: '40px'
      },
      preferCSSPageSize: true
    });
    await browser.close();

    // Return the PDF file
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${file.name.replace(/\.(doc|docx)$/, '.pdf')}"`,
      },
    });
  } catch (error) {
    console.error('Error converting document:', error);
    return NextResponse.json(
      { error: 'Error converting document' },
      { status: 500 }
    );
  }
}
