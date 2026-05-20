import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Proxy the request to our Python FastAPI backend
    // which handles the heavier multi-agent orchestrations (PreFlight_Orchestrator, PersonaPanel parallel loops)
    // using Application Default Credentials (ADC).
    const backendUrl = process.env.PUBLIC_API_URL || 'http://localhost:8000';
    
    const response = await fetch(`${backendUrl}/api/preflight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Optional: Attach secure tokens/ADC here without exposing raw Google credentials to the client browser layout.
        ...(process.env.BACKEND_API_KEY && { 'Authorization': `Bearer ${process.env.BACKEND_API_KEY}` })
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return NextResponse.json(
        { error: 'Backend agent orchestration failed', details: errorData }, 
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Preflight API Route Proxy Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error during proxy' }, 
      { status: 500 }
    );
  }
}
