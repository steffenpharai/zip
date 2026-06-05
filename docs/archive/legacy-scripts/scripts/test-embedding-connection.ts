/**
 * Comprehensive test script to verify OpenAI embedding model connection
 * Tests direct API calls, utility functions, batch operations, and cosine similarity
 * Tests using the environment variables from .env
 */

import OpenAI from "openai";
import { generateEmbedding, generateEmbeddings, cosineSimilarity } from "../lib/utils/embeddings";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

async function testDirectAPIConnection(): Promise<TestResult> {
  const testName = "Direct OpenAI API Connection";
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

    if (!apiKey) {
      return { name: testName, passed: false, error: "OPENAI_API_KEY is not set" };
    }

    if (embeddingModel !== "text-embedding-3-small") {
      return { 
        name: testName, 
        passed: false, 
        error: `Expected model 'text-embedding-3-small', got '${embeddingModel}'` 
      };
    }

    const openai = new OpenAI({ apiKey });
    const testText = "This is a test message to verify embedding connection";

    const response = await openai.embeddings.create({
      model: embeddingModel,
      input: testText,
    });

    const embedding = response.data[0].embedding;

    if (embedding.length !== 1536) {
      return { 
        name: testName, 
        passed: false, 
        error: `Expected 1536 dimensions, got ${embedding.length}` 
      };
    }

    return {
      name: testName,
      passed: true,
      details: {
        model: embeddingModel,
        dimensions: embedding.length,
        firstValues: embedding.slice(0, 5).map(v => v.toFixed(4)),
      },
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message || String(error),
    };
  }
}

async function testUtilityFunction(): Promise<TestResult> {
  const testName = "Embedding Utility Function";
  try {
    const testText = "Testing the utility function for embeddings";
    const embedding = await generateEmbedding(testText);

    if (!Array.isArray(embedding)) {
      return { name: testName, passed: false, error: "Embedding is not an array" };
    }

    if (embedding.length !== 1536) {
      return { 
        name: testName, 
        passed: false, 
        error: `Expected 1536 dimensions, got ${embedding.length}` 
      };
    }

    // Check that values are numbers
    if (!embedding.every(v => typeof v === "number" && !isNaN(v))) {
      return { name: testName, passed: false, error: "Embedding contains invalid values" };
    }

    return {
      name: testName,
      passed: true,
      details: {
        dimensions: embedding.length,
        sampleValues: embedding.slice(0, 5).map(v => v.toFixed(4)),
      },
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message || String(error),
    };
  }
}

async function testBatchEmbeddings(): Promise<TestResult> {
  const testName = "Batch Embeddings";
  try {
    const testTexts = [
      "First test document for batch processing",
      "Second test document for batch processing",
      "Third test document for batch processing",
    ];

    const embeddings = await generateEmbeddings(testTexts);

    if (embeddings.length !== testTexts.length) {
      return { 
        name: testName, 
        passed: false, 
        error: `Expected ${testTexts.length} embeddings, got ${embeddings.length}` 
      };
    }

    // Verify all embeddings have correct dimensions
    for (let i = 0; i < embeddings.length; i++) {
      if (embeddings[i].length !== 1536) {
        return { 
          name: testName, 
          passed: false, 
          error: `Embedding ${i} has ${embeddings[i].length} dimensions, expected 1536` 
        };
      }
    }

    return {
      name: testName,
      passed: true,
      details: {
        count: embeddings.length,
        dimensions: embeddings[0].length,
      },
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message || String(error),
    };
  }
}

async function testCosineSimilarity(): Promise<TestResult> {
  const testName = "Cosine Similarity";
  try {
    // Generate embeddings for similar and different texts
    const similarText1 = "The cat sat on the mat";
    const similarText2 = "A cat was sitting on a mat";
    const differentText = "Quantum physics and machine learning algorithms";

    const [embedding1, embedding2, embedding3] = await generateEmbeddings([
      similarText1,
      similarText2,
      differentText,
    ]);

    const similaritySimilar = cosineSimilarity(embedding1, embedding2);
    const similarityDifferent = cosineSimilarity(embedding1, embedding3);

    if (similaritySimilar < 0.5) {
      return { 
        name: testName, 
        passed: false, 
        error: `Similar texts have low similarity: ${similaritySimilar.toFixed(4)}` 
      };
    }

    if (similarityDifferent > similaritySimilar) {
      return { 
        name: testName, 
        passed: false, 
        error: `Different texts are more similar than similar texts` 
      };
    }

    if (similaritySimilar < 0 || similaritySimilar > 1) {
      return { 
        name: testName, 
        passed: false, 
        error: `Similarity out of range: ${similaritySimilar}` 
      };
    }

    return {
      name: testName,
      passed: true,
      details: {
        similarSimilarity: similaritySimilar.toFixed(4),
        differentSimilarity: similarityDifferent.toFixed(4),
      },
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message || String(error),
    };
  }
}

async function testEnvironmentVariables(): Promise<TestResult> {
  const testName = "Environment Variables";
  const apiKey = process.env.OPENAI_API_KEY;
  const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

  if (!apiKey) {
    return { name: testName, passed: false, error: "OPENAI_API_KEY is not set" };
  }

  if (embeddingModel !== "text-embedding-3-small") {
    return { 
      name: testName, 
      passed: false, 
      error: `Expected model 'text-embedding-3-small', got '${embeddingModel}'` 
    };
  }

  return {
    name: testName,
    passed: true,
    details: {
      apiKeyPresent: true,
      model: embeddingModel,
    },
  };
}

async function runAllTests(): Promise<boolean> {
  console.log("=".repeat(60));
  console.log("Testing OpenAI text-embedding-3-small Model Connection");
  console.log("=".repeat(60));
  console.log("");

  // Display environment info
  const apiKey = process.env.OPENAI_API_KEY;
  const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  
  console.log("Environment Configuration:");
  console.log(`  OPENAI_API_KEY: ${apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : "NOT SET"}`);
  console.log(`  OPENAI_EMBEDDING_MODEL: ${embeddingModel}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
  console.log("");

  const tests = [
    testEnvironmentVariables,
    testDirectAPIConnection,
    testUtilityFunction,
    testBatchEmbeddings,
    testCosineSimilarity,
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    try {
      const result = await test();
      results.push(result);
      
      if (result.passed) {
        console.log(`✓ ${result.name}`);
        if (result.details) {
          Object.entries(result.details).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              console.log(`    ${key}: [${value.join(", ")}]`);
            } else {
              console.log(`    ${key}: ${value}`);
            }
          });
        }
      } else {
        console.log(`✗ ${result.name}`);
        console.log(`    ERROR: ${result.error}`);
      }
      console.log("");
    } catch (error: any) {
      results.push({
        name: test.name,
        passed: false,
        error: error.message || String(error),
      });
      console.log(`✗ ${test.name}`);
      console.log(`    FATAL ERROR: ${error.message || String(error)}`);
      console.log("");
    }
  }

  // Summary
  console.log("=".repeat(60));
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`Test Results: ${passed}/${total} passed`);
  console.log("=".repeat(60));
  console.log("");

  if (passed === total) {
    console.log("✓ All tests passed! The embedding model is working correctly.");
    return true;
  } else {
    console.log("✗ Some tests failed. Please check the errors above.");
    return false;
  }
}

runAllTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

