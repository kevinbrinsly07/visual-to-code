import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Check if Gemini API key is available
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ ERROR: GEMINI_API_KEY is not set in environment variables');
  console.log('💡 Please create a .env file with: GEMINI_API_KEY=your_gemini_key_here');
  process.exit(1);
}

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
  }
  res.status(500).json({ error: error.message });
});

// Function to convert file to Gemini format
function fileToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType: mimeType
    },
  };
}

// Use the most basic and widely available models
const AVAILABLE_MODELS = [
  'gemini-pro',        // Most widely available
  'gemini-1.0-pro',    // Alternative name
];

// Main route for generating code with Gemini
app.post('/api/generate-code', upload.single('image'), async (req, res) => {
  try {
    console.log('📨 Received request to generate code with Gemini');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { framework = 'html', features = '[]' } = req.body;
    const featureList = JSON.parse(features);
    
    console.log(`🛠️ Framework: ${framework}, Features: ${featureList.join(', ')}`);

    // System prompt based on framework
    const frameworkPrompts = {
      html: 'Generate clean, semantic HTML and CSS. Use modern CSS with Flexbox/Grid. Make it responsive and accessible.',
      tailwind: 'Generate HTML with Tailwind CSS classes. Make it responsive and use proper Tailwind utility classes. Include the necessary Tailwind CSS CDN link in the head.',
      react: 'Generate a React functional component with JSX. Use modern React practices and functional components. Include any necessary imports.',
      vue: 'Generate a Vue single-file component with template, script, and style sections.'
    };

    const featurePrompts = {
      responsive: 'Ensure the design is fully responsive and works on mobile, tablet, and desktop.',
      accessible: 'Include proper ARIA labels, semantic HTML, and accessibility features.',
      interactive: 'Add appropriate hover states, focus states, and interactive elements where needed.',
      modern: 'Use modern CSS features like Flexbox/Grid and best practices.'
    };

    const featureText = featureList.map(feature => featurePrompts[feature] || '').join(' ');

    const prompt = `
      You are an expert frontend developer. Convert the provided UI design to clean, production-ready code.
      ${frameworkPrompts[framework]}
      ${featureText}
      
      IMPORTANT GUIDELINES:
      1. Create pixel-perfect, clean code that matches the design exactly
      2. Use semantic HTML5 elements
      3. Make it fully responsive
      4. Include proper accessibility attributes
      5. Use modern CSS practices (Flexbox/Grid)
      6. Add comments for important sections
      7. Ensure cross-browser compatibility
      8. Use appropriate colors, spacing, and typography
      9. Export complete, runnable code
      10. If using Tailwind, include the CDN link: <script src="https://cdn.tailwindcss.com"></script>
      
      Return only the code without any explanations or markdown formatting.
    `;

    console.log('🚀 Sending request to Google Gemini...');
    
    // Try different models until one works
    let lastError = null;
    
    for (const modelName of AVAILABLE_MODELS) {
      try {
        console.log(`🔄 Trying model: ${modelName}`);
        
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            maxOutputTokens: 4000,
            temperature: 0.4,
          },
        });

        // For basic models without vision, we'll use a text-only approach
        // But first let's try with image if the model supports it
        const imagePart = fileToGenerativePart(req.file.buffer, req.file.mimetype);
        
        try {
          const result = await model.generateContent([prompt, imagePart]);
          const response = await result.response;
          const generatedCode = response.text();
          
          console.log(`✅ Successfully generated code with ${modelName} (with vision)`);
          console.log(`📝 Code length: ${generatedCode.length} characters`);
          
          return res.json({
            success: true,
            code: generatedCode,
            framework: framework,
            features: featureList,
            provider: 'google-gemini',
            model: modelName,
            vision: true,
            timestamp: new Date().toISOString()
          });
        } catch (visionError) {
          // If vision fails, try text-only with image description
          console.log(`🔄 Vision not supported, trying text-only approach...`);
          
          const textPrompt = `
            ${prompt}
            
            Since I cannot process the image directly, please generate a generic ${framework} component that includes:
            - A responsive layout
            - Modern styling
            - Common UI elements (buttons, inputs, cards, etc.)
            - Accessibility features
            - Clean, production-ready code
            
            Make it look professional and modern.
          `;
          
          const textResult = await model.generateContent(textPrompt);
          const textResponse = await textResult.response;
          const generatedCode = textResponse.text();
          
          console.log(`✅ Successfully generated code with ${modelName} (text-only)`);
          console.log(`📝 Code length: ${generatedCode.length} characters`);
          
          return res.json({
            success: true,
            code: generatedCode,
            framework: framework,
            features: featureList,
            provider: 'google-gemini',
            model: modelName,
            vision: false,
            note: 'Generated generic code (vision not available)',
            timestamp: new Date().toISOString()
          });
        }
        
      } catch (error) {
        console.log(`❌ Model ${modelName} failed:`, error.message);
        lastError = error;
        continue; // Try next model
      }
    }
    
    // If all models failed, use the fallback template
    console.log('🔄 All models failed, using fallback template');
    return generateFallbackCode(req, res, framework, featureList);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    
    // Use fallback template as last resort
    const { framework = 'html', features = '[]' } = req.body;
    const featureList = JSON.parse(features);
    return generateFallbackCode(req, res, framework, featureList);
  }
});

// Fallback code generator
function generateFallbackCode(req, res, framework, features) {
  const fallbackTemplates = {
    html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated UI Component</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            max-width: 400px;
            width: 100%;
        }
        .card {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .card-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            text-align: center;
        }
        .card-body {
            padding: 2rem;
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
            color: #333;
        }
        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        .btn {
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
        @media (max-width: 480px) {
            .card-header, .card-body {
                padding: 1.5rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="card-header">
                <h1>Welcome Back</h1>
                <p>Sign in to your account</p>
            </div>
            <div class="card-body">
                <div class="form-group">
                    <label for="email">Email Address</label>
                    <input type="email" id="email" placeholder="Enter your email">
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" placeholder="Enter your password">
                </div>
                <button class="btn">Sign In</button>
            </div>
        </div>
    </div>
</body>
</html>`,

    react: `import React, { useState } from 'react';
import './App.css';

function App() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        console.log('Sign in attempt:', { email, password });
    };

    return (
        <div className="app">
            <div className="container">
                <div className="card">
                    <div className="card-header">
                        <h1>Welcome Back</h1>
                        <p>Sign in to your account</p>
                    </div>
                    <div className="card-body">
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label htmlFor="email">Email Address</label>
                                <input
                                    type="email"
                                    id="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="password">Password</label>
                                <input
                                    type="password"
                                    id="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    required
                                />
                            </div>
                            <button type="submit" className="btn">
                                Sign In
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;`,

    tailwind: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tailwind UI</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-blue-400 to-purple-600 min-h-screen flex items-center justify-center p-4">
    <div class="max-w-md w-full">
        <div class="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div class="bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-8 text-center text-white">
                <h1 class="text-3xl font-bold mb-2">Welcome Back</h1>
                <p class="opacity-90">Sign in to your account</p>
            </div>
            <div class="p-6">
                <form>
                    <div class="mb-4">
                        <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
                            Email Address
                        </label>
                        <input
                            type="email"
                            id="email"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            placeholder="Enter your email"
                        />
                    </div>
                    <div class="mb-6">
                        <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            placeholder="Enter your password"
                        />
                    </div>
                    <button
                        type="submit"
                        class="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-4 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Sign In
                    </button>
                </form>
            </div>
        </div>
    </div>
</body>
</html>`,

    vue: `<template>
    <div id="app">
        <div class="container">
            <div class="card">
                <div class="card-header">
                    <h1>Welcome Back</h1>
                    <p>Sign in to your account</p>
                </div>
                <div class="card-body">
                    <form @submit.prevent="handleSubmit">
                        <div class="form-group">
                            <label for="email">Email Address</label>
                            <input
                                type="email"
                                id="email"
                                v-model="email"
                                placeholder="Enter your email"
                                required
                            />
                        </div>
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input
                                type="password"
                                id="password"
                                v-model="password"
                                placeholder="Enter your password"
                                required
                            />
                        </div>
                        <button type="submit" class="btn">
                            Sign In
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'App',
    data() {
        return {
            email: '',
            password: ''
        };
    },
    methods: {
        handleSubmit() {
            console.log('Sign in attempt:', {
                email: this.email,
                password: this.password
            });
        }
    }
};
</script>

<style scoped>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

#app {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}

.container {
    max-width: 400px;
    width: 100%;
}

.card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
    overflow: hidden;
}

.card-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 2rem;
    text-align: center;
}

.card-body {
    padding: 2rem;
}

.form-group {
    margin-bottom: 1.5rem;
}

label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #333;
}

input {
    width: 100%;
    padding: 12px;
    border: 2px solid #e1e5e9;
    border-radius: 8px;
    font-size: 16px;
    transition: border-color 0.3s;
}

input:focus {
    outline: none;
    border-color: #667eea;
}

.btn {
    width: 100%;
    padding: 12px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
}

.btn:hover {
    transform: translateY(-2px);
}

@media (max-width: 480px) {
    .card-header, .card-body {
        padding: 1.5rem;
    }
}
</style>`
  };

  const template = fallbackTemplates[framework] || fallbackTemplates.html;
  
  res.json({
    success: true,
    code: template,
    framework: framework,
    features: features,
    provider: 'fallback-template',
    model: 'none',
    vision: false,
    note: 'Using fallback template - check your Gemini API configuration',
    timestamp: new Date().toISOString()
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    gemini: process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Not configured',
    provider: 'Google Gemini',
    available_models: AVAILABLE_MODELS,
    message: 'Visual to Code API is running with Gemini'
  });
});

// Test endpoint to verify Gemini is working (text-only)
app.post('/api/test-gemini', async (req, res) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const result = await model.generateContent("Write a simple 'Hello World' HTML page with some basic styling");
    const response = await result.response;
    
    res.json({
      success: true,
      message: 'Google Gemini API is working correctly',
      provider: 'gemini-pro',
      test_output: response.text()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Google Gemini API test failed',
      details: error.message,
      provider: 'gemini-pro',
      suggestion: 'Your API key may not have access to the Gemini models. Check your Google AI Studio settings.'
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔑 Google Gemini API Key: ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`🌐 Frontend URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
  console.log(`🤖 AI Provider: Google Gemini`);
  console.log(`📋 Available models: ${AVAILABLE_MODELS.join(', ')}`);
});