import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dotNumber = searchParams.get('dotNumber');

  if (!dotNumber) return NextResponse.json({ error: 'DOT Number required' }, { status: 400 });

  try {
    // Step 1: Search the L&I Portal to get the internal FMCSA pv_apcant_id
    const searchBody = new URLSearchParams();
    searchBody.append('n_dotno', dotNumber);
    searchBody.append('s_prefix', 'MC');
    searchBody.append('n_docketno', '');
    searchBody.append('s_legalname', '');
    searchBody.append('s_dbaname', '');
    searchBody.append('s_state', '');

    const searchRes = await fetch('https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: searchBody.toString()
    });
    const searchHtml = await searchRes.text();
    
    // Extract the hidden internal ID
    const idMatch = searchHtml.match(/name="pv_apcant_id"\s+value="([^"]+)"/i);
    if (!idMatch) {
      return NextResponse.json({ owner: 'Not Listed', policies: [] });
    }
    const apcantId = idMatch[1];

    // Step 2: Fetch the Carrier Detail page for the Owner/Representative Name
    const detailBody = new URLSearchParams();
    detailBody.append('pv_apcant_id', apcantId);
    detailBody.append('pv_vpath', 'LIVIEW');
    
    const detailRes = await fetch('https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_getdetail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: detailBody.toString()
    });
    const detailHtml = await detailRes.text();
    
    const repMatch = detailHtml.match(/Representative:[\s\S]*?<td[^>]*><font[^>]*>(.*?)<\/font>/i);
    const ownerName = repMatch ? repMatch[1].replace(/<br>/gi, ' ').replace(/<[^>]+>/g, '').trim() : 'Not Listed';

    // Step 3: Fetch the Active/Pending Insurance Table
    const insRes = await fetch('https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_activeinsurance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: detailBody.toString()
    });
    const insHtml = await insRes.text();
    
    const $ = cheerio.load(insHtml);
    const policies: any[] = [];
    
    // Find the table containing "Active/Pending Insurance" and parse the rows
    $('table th:contains("Form")').closest('table').find('tr').each((i, el) => {
      const cols = $(el).find('td');
      if (cols.length >= 9) {
        policies.push({
          form: $(cols[0]).text().trim(),
          type: $(cols[1]).text().trim(),
          carrier: $(cols[2]).text().trim(),
          policy: $(cols[3]).text().trim(),
          received: $(cols[4]).text().trim(),
          coverage: $(cols[5]).text().trim(),
          effective: $(cols[6]).text().trim(),
          status: $(cols[8]).text().trim()
        });
      }
    });

    return NextResponse.json({ owner: ownerName, policies });
  } catch (error) {
    console.error('L&I Scraper Error:', error);
    return NextResponse.json({ error: 'Failed to scrape L&I portal' }, { status: 500 });
  }
}