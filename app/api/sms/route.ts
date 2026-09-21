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
    return NextResponse.json({ error: 'Missing API Credentials on Server' }, { status: 500 });
  }

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
        cache: 'no-store' 
      }
    );

    // If the DOT rejects the request, capture their exact reason
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`DOT API Error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `FMCSA Server Status ${response.status} - ${errorText}` }, 
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Backend SMS Fetch Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}