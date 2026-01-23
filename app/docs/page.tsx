'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import 'swagger-ui-react/swagger-ui.css';

// Dynamically import SwaggerUI to avoid SSR issues
const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function ApiDocs() {
  const [spec, setSpec] = useState<object | null>(null);

  useEffect(() => {
    // Fetch the spec from an API route or just import it dynamically?
    // Importing 'swagger-jsdoc' client-side might be huge and node-dependent.
    // Better to have an API route serve the spec, or import the JSON if possible.
    // But 'lib/swagger.ts' imports 'swagger-jsdoc' which is Node-only usually.
    // So we need a server route to serve the JSON.
    fetch('/api/docs')
      .then((res) => res.json())
      .then((data) => setSpec(data))
      .catch((err) => console.error(err));
  }, []);

  if (!spec) return <div style={{ padding: 20 }}>Loading API Docs...</div>;

  return (
    <div style={{ background: 'white', minHeight: '100vh', paddingBottom: '50px' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #eee', marginBottom: '20px' }}>
            <h1 style={{ margin: 0, color: '#333' }}>📚 Getzumi AI API Documentation</h1>
            <p style={{ margin: '5px 0 0', color: '#666' }}>
                Endpoints for image generation and storage integration.
            </p>
        </div>
        <SwaggerUI spec={spec} />
    </div>
  );
}
