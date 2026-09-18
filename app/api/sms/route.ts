import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dotNumber = searchParams.get('dotNumber');

  if (!dotNumber) {
    return NextResponse.json({ error: 'DOT Number required' }, { status: 400 });
  }

  const keyId = process.env.DOT_API_KEY_ID;
  const keySecret = process.env.DOT_API_SECRET;

  if (!keyId || !keySecret) {
    console.error('Missing DOT API credentials in environment variables.');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Socrata requires Basic Auth (Base64 encoded ID:Secret) for private datasets
  const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

  try {
    const response = await fetch(
      `https://data.transportation.gov/resource/sjpe-nzai.json?$where=dot_number='${dotNumber}' OR usdot_number='${dotNumber}'`,
      {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'X-App-Token': 'OoEPnNHuAHbkGpmXKwtXZRd1M',
          'Accept': 'application/json'
        },
        // Prevent Next.js from aggressively caching this live data
        cache: 'no-store' 
      }
    );

    if (!response.ok) {
      throw new Error(`DOT API responded with status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Backend SMS Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch SMS data from FMCSA' }, { status: 500 });
  }
}