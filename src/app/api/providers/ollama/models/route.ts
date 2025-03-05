/**
 * Ollama Models API Endpoint
 * 
 * This endpoint fetches available models from an Ollama instance.
 */

import { NextRequest } from 'next/server';

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaModelsResponse {
  models: OllamaModel[];
}

export async function GET(req: NextRequest) {
  try {
    // Get the base URL from the query string or use the default
    const searchParams = req.nextUrl.searchParams;
    const baseUrl = searchParams.get('baseUrl') || 'http://localhost:11434';
    
    // Normalize the base URL (ensure it doesn't end with a slash)
    const normalizedBaseUrl = baseUrl.endsWith('/') 
      ? baseUrl.slice(0, -1) 
      : baseUrl;
    
    // Make request to Ollama API to fetch models
    const response = await fetch(`${normalizedBaseUrl}/api/tags`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Set a timeout of 5 seconds
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Handle specific error cases
      if (response.status === 404) {
        return Response.json({ 
          error: 'Not found', 
          message: 'Ollama API endpoint not found' 
        }, { status: 404 });
      }
      
      const errorText = await response.text();
      return Response.json({ 
        error: 'Ollama API error', 
        message: errorText 
      }, { status: response.status });
    }

    const data: OllamaModelsResponse = await response.json();
    
    // Transform the data to a simpler format
    const models = data.models.map(model => ({
      id: model.name,
      name: model.name,
      details: model.details ? {
        family: model.details.family,
        parameterSize: model.details.parameter_size,
      } : undefined,
      size: model.size,
    }));

    // If no models are found, return a specific message
    if (models.length === 0) {
      return Response.json({ 
        models: [],
        message: 'No models found in Ollama instance' 
      });
    }

    return Response.json({ models });
  } catch (error) {
    console.error('Error fetching Ollama models:', error);
    
    // Handle different error types
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return Response.json({ 
        error: 'Connection error', 
        message: 'Could not connect to Ollama instance' 
      }, { status: 503 });
    }
    
    if (error instanceof DOMException && error.name === 'AbortError') {
      return Response.json({ 
        error: 'Timeout', 
        message: 'Connection to Ollama timed out' 
      }, { status: 504 });
    }
    
    return Response.json({ 
      error: 'Unknown error', 
      message: error instanceof Error ? error.message : 'An unknown error occurred' 
    }, { status: 500 });
  }
}