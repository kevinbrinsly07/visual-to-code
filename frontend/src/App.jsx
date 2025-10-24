import React, { useState, useRef } from 'react';
import axios from 'axios';

const App = () => {
  const [image, setImage] = useState(null);
  const [generatedCode, setGeneratedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('code');
  const [framework, setFramework] = useState('html');
  const [features, setFeatures] = useState(['responsive', 'accessible']);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [apiStatus, setApiStatus] = useState('unknown');
  
  const fileInputRef = useRef(null);
  const codeRef = useRef(null);

  // Check API health on component mount
  React.useEffect(() => {
    checkApiHealth();
  }, []);

  const checkApiHealth = async () => {
    try {
      const response = await axios.get('/api/health');
      setApiStatus('healthy');
      console.log('API Health:', response.data);
    } catch (error) {
      setApiStatus('unhealthy');
      console.error('API Health check failed:', error);
    }
  };

  const handleFileSelect = (file) => {
    if (file && file.type.startsWith('image/')) {
      if (file.size > 10 * 1024 * 1024) {
        setError('File size too large. Maximum size is 10MB.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target.result);
        setUploadedFileName(file.name);
      };
      reader.readAsDataURL(file);
      setError('');
    } else {
      setError('Please select a valid image file (JPEG, PNG, WebP, etc.)');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleFeatureToggle = (feature) => {
    setFeatures(prev =>
      prev.includes(feature)
        ? prev.filter(f => f !== feature)
        : [...prev, feature]
    );
  };

  const generateCode = async () => {
    if (!image) {
      setError('Please upload an image first');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      // Convert data URL to blob
      const response = await fetch(image);
      const blob = await response.blob();
      const file = new File([blob], 'design.png', { type: 'image/png' });

      const formData = new FormData();
      formData.append('image', file);
      formData.append('framework', framework);
      formData.append('features', JSON.stringify(features));

      const result = await axios.post('/api/generate-code', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000 // 120 second timeout for Gemini
      });

      if (result.data.success) {
        setGeneratedCode(result.data.code);
        setActiveTab('code');
      } else {
        setError(result.data.error || 'Failed to generate code');
      }
      
    } catch (err) {
      console.error('Error generating code:', err);
      if (err.code === 'ECONNABORTED') {
        setError('Request timeout. The image might be too complex. Please try again.');
      } else if (err.response?.status === 429) {
        setError('Google Gemini API quota exceeded. Please check your Google AI Studio quota.');
      } else if (err.response?.status === 401) {
        setError('Invalid Google Gemini API key. Please check your backend configuration.');
      } else if (err.response?.status === 500) {
        setError('Server error. Please check if the backend is running and the Gemini API key is valid.');
      } else {
        setError(err.response?.data?.error || 'Failed to generate code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (codeRef.current) {
      try {
        await navigator.clipboard.writeText(generatedCode);
        alert('✅ Code copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy code:', err);
        alert('❌ Failed to copy code. Please select and copy manually.');
      }
    }
  };

  const extractHTMLFromCode = (code) => {
    // Remove markdown code blocks if present
    let cleanCode = code.replace(/```(?:html|javascript|jsx)?\n?/g, '').replace(/```/g, '').trim();
    
    // If it's a complete HTML document, use as is
    if (cleanCode.includes('<!DOCTYPE html>') || cleanCode.includes('<html')) {
      return cleanCode;
    }
    
    // If it's React component, wrap in basic HTML
    if (framework === 'react') {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated React Component</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${cleanCode}
    ReactDOM.render(<App />, document.getElementById('root'));
  </script>
</body>
</html>`;
    }
    
    // For Vue component (simplified)
    if (framework === 'vue') {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Vue Component</title>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    ${cleanCode}
    app.mount('#app');
  </script>
</body>
</html>`;
    }
    
    // For Tailwind, include the CDN
    if (framework === 'tailwind') {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Tailwind UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
  ${cleanCode}
</body>
</html>`;
    }
    
    // For plain HTML/CSS
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated UI</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
      padding: 20px; 
      background: #f5f5f5;
      margin: 0;
    }
    * { box-sizing: border-box; }
    ${cleanCode.includes('</style>') ? '' : cleanCode.includes('{') ? cleanCode : ''}
  </style>
</head>
<body>
  ${cleanCode.includes('<') ? cleanCode : `<div class="container">${cleanCode}</div>`}
</body>
</html>`;
  };

  const clearAll = () => {
    setImage(null);
    setGeneratedCode('');
    setError('');
    setUploadedFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const testConnection = async () => {
    try {
      setLoading(true);
      const response = await axios.post('/api/test-gemini');
      alert(`✅ Connection successful!\n\n${response.data.test_output}`);
    } catch (error) {
      alert(`❌ Connection failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="app">
        <header className="header">
          <h1>
            🎨 Visual to Code Generator
            <span className="gemini-badge">Powered by Google Gemini</span>
          </h1>
          <p>Upload any UI design and get clean, production-ready code using Google Gemini AI</p>
          
          <div className="stats">
            <div className="stat">
              Status: 
              <span style={{ 
                color: apiStatus === 'healthy' ? '#34a853' : '#ea4335',
                fontWeight: 'bold'
              }}>
                {apiStatus === 'healthy' ? '✅ Connected' : '❌ Disconnected'}
              </span>
            </div>
            <div className="stat">
              <span className="provider-badge">Google Gemini AI</span>
            </div>
            <div className="stat">
              🆓 Free Tier Available
            </div>
          </div>
        </header>

        <section className="upload-section">
          <div
            className={`upload-area ${dragOver ? 'drag-over' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-icon">📁</div>
            <div className="upload-text">
              {dragOver ? '📥 Drop image here' : '📁 Click to upload or drag and drop'}
            </div>
            <p>Supports PNG, JPG, JPEG, WebP (Max 10MB)</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileSelect(e.target.files[0])}
            />
          </div>

          {uploadedFileName && (
            <div className="stats">
              <div className="stat">📄 {uploadedFileName}</div>
              <div className="stat">🖼️ Ready to generate code</div>
            </div>
          )}

          {image && (
            <div className="preview-container">
              <h3>Design Preview:</h3>
              <img src={image} alt="Uploaded design" className="preview-image" />
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                <button className="clear-button" onClick={clearAll}>
                  🗑️ Clear All
                </button>
                <button className="clear-button" onClick={testConnection} style={{ background: '#17a2b8' }}>
                  🔗 Test Connection
                </button>
              </div>
            </div>
          )}

          <div className="info-box">
            <h4>💡 How to use:</h4>
            <ol style={{ paddingLeft: '1.5rem', lineHeight: '1.6' }}>
              <li>Upload a clear screenshot of your UI design</li>
              <li>Select your preferred framework</li>
              <li>Choose additional features</li>
              <li>Click "Generate Code with Google Gemini"</li>
              <li>Wait 10-30 seconds for AI processing</li>
              <li>Copy the generated code or preview it live</li>
            </ol>
          </div>
        </section>

        <section className="controls-section">
          <div className="controls-grid">
            <div className="control-group">
              <h3>⚙️ Framework</h3>
              <div className="framework-options">
                {[
                  { id: 'html', label: 'HTML/CSS' },
                  { id: 'tailwind', label: 'Tailwind' },
                  { id: 'react', label: 'React' },
                  { id: 'vue', label: 'Vue' }
                ].map((fw) => (
                  <div key={fw.id} className="framework-option">
                    <input
                      type="radio"
                      id={fw.id}
                      name="framework"
                      value={fw.id}
                      checked={framework === fw.id}
                      onChange={(e) => setFramework(e.target.value)}
                    />
                    <label htmlFor={fw.id}>
                      {fw.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="control-group">
              <h3>🎨 Features</h3>
              <div className="feature-options">
                {[
                  { id: 'responsive', label: '📱 Responsive Design' },
                  { id: 'accessible', label: '♿ Accessibility' },
                  { id: 'interactive', label: '🖱️ Interactive Elements' },
                  { id: 'modern', label: '💎 Modern CSS' }
                ].map((feature) => (
                  <div key={feature.id} className="feature-option">
                    <input
                      type="checkbox"
                      id={feature.id}
                      checked={features.includes(feature.id)}
                      onChange={() => handleFeatureToggle(feature.id)}
                    />
                    <label htmlFor={feature.id}>{feature.label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            className="generate-button"
            onClick={generateCode}
            disabled={!image || loading}
          >
            {loading && <span className="loading-spinner"></span>}
            {loading ? 'Generating Code with Gemini AI...' : '🚀 Generate Code with Google Gemini'}
          </button>

          {loading && (
            <div style={{ textAlign: 'center', marginTop: '1rem', color: '#666' }}>
              <p>⏳ AI is analyzing your design and generating code. This may take 10-30 seconds...</p>
            </div>
          )}
        </section>

        {error && (
          <div className="error-message">
            <span>❌</span>
            <div>
              <strong>Error:</strong> {error}
              <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                💡 Make sure your backend is running and GEMINI_API_KEY is set in the .env file
              </div>
            </div>
          </div>
        )}

        {generatedCode && (
          <section className="output-section">
            <div className="output-tabs">
              <button
                className={`tab ${activeTab === 'code' ? 'active' : ''}`}
                onClick={() => setActiveTab('code')}
              >
                📝 Generated Code
              </button>
              <button
                className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
                onClick={() => setActiveTab('preview')}
              >
                👀 Live Preview
              </button>
            </div>

            {activeTab === 'code' && (
              <div className="code-container">
                <div className="code-header">
                  <span>
                    Generated {framework.toUpperCase()} Code 
                    <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>(via Google Gemini)</span>
                  </span>
                  <button className="copy-button" onClick={copyToClipboard}>
                    📋 Copy Code
                  </button>
                </div>
                <pre ref={codeRef} className="code-content">
                  {generatedCode}
                </pre>
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="preview-container">
                <h3>👀 Live Preview</h3>
                <iframe
                  className="preview-frame"
                  title="Generated Code Preview"
                  srcDoc={extractHTMLFromCode(generatedCode)}
                  sandbox="allow-same-origin allow-scripts"
                />
                <div className="info-box">
                  <h4>💡 Preview Notes:</h4>
                  <ul style={{ paddingLeft: '1.5rem', lineHeight: '1.6' }}>
                    <li>Some interactive features may not work in the preview</li>
                    <li>For React/Vue components, copy code to your development environment</li>
                    <li>Tailwind CSS is loaded from CDN in preview</li>
                    <li>Check responsiveness by resizing the preview window</li>
                  </ul>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default App;