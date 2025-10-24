import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// Routes
app.post('/api/generate-code', upload.single('image'), async (req, res) => {
  try {
    console.log('Received request to generate code');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { framework = 'html', features = '[]' } = req.body;
    const featureList = JSON.parse(features);
    
    // Convert image to base64
    const base64Image = req.file.buffer.toString('base64');
    const imageUrl = `data:${req.file.mimetype};base64,${base64Image}`;

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

    const systemPrompt = `
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

    console.log('Sending request to OpenAI...');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Convert this UI design to clean, production-ready code. Pay close attention to layout, spacing, colors, typography, and all visual details. Make it exactly like the image."
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 4000
    });

    const generatedCode = response.choices[0].message.content;
    
    console.log('Successfully generated code');
    
    res.json({
      success: true,
      code: generatedCode,
      framework: framework,
      features: featureList,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating code:', error);
    
    // Handle specific OpenAI errors
    if (error.code === 'insufficient_quota') {
      return res.status(429).json({
        error: 'OpenAI API quota exceeded. Please check your billing details.',
        details: error.message
      });
    } else if (error.code === 'invalid_api_key') {
      return res.status(401).json({
        error: 'Invalid OpenAI API key. Please check your API key.',
        details: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to generate code',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    openai: process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured'
  });
});

// Test endpoint with a simple code generation
app.post('/api/test', async (req, res) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content: "Write a simple 'Hello World' HTML page"
        }
      ],
      max_tokens: 100
    });

    res.json({
      success: true,
      message: 'OpenAI API is working correctly',
      test_output: response.choices[0].message.content
    });
  } catch (error) {
    res.status(500).json({
      error: 'OpenAI API test failed',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set'}`);
});