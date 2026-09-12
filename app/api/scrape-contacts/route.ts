import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  const { usdot_number } = await request.json();

  if (!usdot_number) {
    return NextResponse.json({ error: 'USDOT number is required' }, { status: 400 });
  }

  try {
    const searchUrl = `https://motus.dot.gov/public/search?usdot=${usdot_number}`;
    const res = await fetch(searchUrl);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Note: DOM selectors require inspection of the live Motus page structure
    const phoneNumber = $('.contact-phone').first().text().trim() || null;
    const emailAddress = $('.contact-email').first().text().trim() || null;

    const { error } = await supabase
      .from('carriers')
      .update({ phone_number: phoneNumber, email_address: emailAddress })
      .eq('usdot_number', usdot_number);

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      phone_number: phoneNumber, 
      email_address: emailAddress 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}