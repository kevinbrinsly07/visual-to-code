import React, { useState, useRef } from "react";
import axios from "axios";

const App = () => {
  const [image, setImage] = useState(null);
  const [generatedCode, setGeneratedCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("code");
  const [framework, setFramework] = useState("html");
  const [features, setFeatures] = useState(["responsive", "accessible"]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");

  const fileInputRef = useRef(null);
  const codeRef = useRef(null);

  const handleFileSelect = (file) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target.result);
        setUploadedFileName(file.name);
      };
      reader.readAsDataURL(file);
      setError("");
    } else {
      setError("Please select a valid image file (JPEG, PNG, etc.)");
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
    setFeatures((prev) =>
      prev.includes(feature)
        ? prev.filter((f) => f !== feature)
        : [...prev, feature]
    );
  };

  const generateCode = async () => {
    if (!image) {
      setError("Please upload an image first");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Convert data URL to blob
      const response = await fetch(image);
      const blob = await response.blob();
      const file = new File([blob], "design.png", { type: "image/png" });

      const formData = new FormData();
      formData.append("image", file);
      formData.append("framework", framework);
      formData.append("features", JSON.stringify(features));

      const result = await axios.post("/api/generate-code", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 60000, // 60 second timeout
      });

      if (result.data.success) {
        setGeneratedCode(result.data.code);
        setActiveTab("code");
      } else {
        setError(result.data.error || "Failed to generate code");
      }
    } catch (err) {
      console.error("Error generating code:", err);
      if (err.code === "ECONNABORTED") {
        setError("Request timeout. Please try again.");
      } else if (err.response?.status === 429) {
        setError("OpenAI API quota exceeded. Please check your billing.");
      } else if (err.response?.status === 401) {
        setError(
          "Invalid OpenAI API key. Please check your backend configuration."
        );
      } else {
        setError(
          err.response?.data?.error ||
            "Failed to generate code. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (codeRef.current) {
      try {
        await navigator.clipboard.writeText(generatedCode);
        alert("Code copied to clipboard!");
      } catch (err) {
        console.error("Failed to copy code:", err);
      }
    }
  };

  const extractHTMLFromCode = (code) => {
    // Remove markdown code blocks if present
    let cleanCode = code
      .replace(/```(?:html|javascript|jsx)?\n?/g, "")
      .replace(/```/g, "")
      .trim();

    // If it's a complete HTML document, use as is
    if (cleanCode.includes("<!DOCTYPE html>") || cleanCode.includes("<html")) {
      return cleanCode;
    }

    // If it's React/Vue component, wrap in basic HTML
    if (framework === "react" || framework === "vue") {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated ${framework} Component</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
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

    // For Tailwind, include the CDN
    if (framework === "tailwind") {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Tailwind UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
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
    body { font-family: Arial, sans-serif; padding: 20px; }
    ${
      cleanCode.includes("</style>")
        ? ""
        : cleanCode.includes("{")
        ? cleanCode
        : ""
    }
  </style>
</head>
<body>
  ${cleanCode.includes("<") ? cleanCode : `<div>${cleanCode}</div>`}
</body>
</html>`;
  };

  const clearAll = () => {
    setImage(null);
    setGeneratedCode("");
    setError("");
    setUploadedFileName("");
  };

  return (
    <div className="container">
      <div className="app">
        <header className="header">
          <h1>🎨 Visual to Code Generator</h1>
          <p>
            Upload any UI design and get clean, production-ready code using
            OpenAI GPT-4 Vision
          </p>
        </header>

        <section className="upload-section">
          <div
            className={`upload-area ${dragOver ? "drag-over" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-icon">📁</div>
            <div className="upload-text">
              {dragOver
                ? "Drop image here"
                : "Click to upload or drag and drop"}
            </div>
            <p>Supports PNG, JPG, JPEG (Max 10MB)</p>
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
            </div>
          )}

          {image && (
            <div className="preview-container">
              <h3>Design Preview:</h3>
              <img
                src={image}
                alt="Uploaded design"
                className="preview-image"
              />
              <button
                onClick={clearAll}
                style={{
                  marginTop: "1rem",
                  padding: "0.5rem 1rem",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Clear All
              </button>
            </div>
          )}
        </section>

        <section className="controls-section">
          <div className="controls-grid">
            <div className="control-group">
              <h3>Framework</h3>
              <div className="framework-options">
                {[
                  { id: "html", label: "HTML/CSS" },
                  { id: "tailwind", label: "Tailwind" },
                  { id: "react", label: "React" },
                  { id: "vue", label: "Vue" },
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
                    <label htmlFor={fw.id}>{fw.label}</label>
                  </div>
                ))}
              </div>
            </div>

            <div className="control-group">
              <h3>Features</h3>
              <div className="feature-options">
                {[
                  { id: "responsive", label: "Responsive Design" },
                  { id: "accessible", label: "Accessibility" },
                  { id: "interactive", label: "Interactive Elements" },
                  { id: "modern", label: "Modern CSS" },
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
            {loading
              ? "Generating Code with OpenAI..."
              : "✨ Generate Code with OpenAI"}
          </button>

          {loading && (
            <div
              style={{ textAlign: "center", marginTop: "1rem", color: "#666" }}
            >
              <p>
                ⏳ This may take 20-30 seconds as we process your image with
                GPT-4 Vision...
              </p>
            </div>
          )}
        </section>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        {generatedCode && (
          <section className="output-section">
            <div className="output-tabs">
              <button
                className={`tab ${activeTab === "code" ? "active" : ""}`}
                onClick={() => setActiveTab("code")}
              >
                Generated Code
              </button>
              <button
                className={`tab ${activeTab === "preview" ? "active" : ""}`}
                onClick={() => setActiveTab("preview")}
              >
                Live Preview
              </button>
            </div>

            {activeTab === "code" && (
              <div className="code-container">
                <div className="code-header">
                  <span>
                    Generated {framework.toUpperCase()} Code (via OpenAI)
                  </span>
                  <button className="copy-button" onClick={copyToClipboard}>
                    Copy Code
                  </button>
                </div>
                <pre ref={codeRef} className="code-content">
                  {generatedCode}
                </pre>
              </div>
            )}

            {activeTab === "preview" && (
              <div className="preview-container">
                <h3>Live Preview</h3>
                <iframe
                  className="preview-frame"
                  title="Generated Code Preview"
                  srcDoc={extractHTMLFromCode(generatedCode)}
                  sandbox="allow-same-origin allow-scripts"
                />
                <p
                  style={{
                    marginTop: "1rem",
                    fontSize: "0.9rem",
                    color: "#666",
                  }}
                >
                  Note: Some features may not work perfectly in the preview. For
                  React/Vue components, copy the code to your development
                  environment.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default App;
