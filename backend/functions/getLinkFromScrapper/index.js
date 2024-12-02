import { ApifyClient } from "apify-client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv/config";
import { extractAudioLinks } from "./utils.js";

export const handler = async (event) => {
  console.info("Event received:", JSON.stringify(event));

  const query = event.query;
  if (!query) {
    console.error("No query parameter provided.");
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Query parameter is required." }),
    };
  }

  try {
    const client = new ApifyClient({
      token: process.env.APIFY_TOKEN,
    });

    const input = {
      queries: `download ${query} song 320kbps`,
      resultsPerPage: 5,
      maxPagesPerQuery: 1,
    };

    const run = await client.actor("nFJndFXA5zjCTuudP").call(input);

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    const searchResults = items[0]?.organicResults || [];
    if (searchResults.length === 0) {
      console.warn("No search results found.");
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "No search results found." }),
      };
    }

    const filteredLinks = await extractAudioLinks(searchResults);

    const formattedUrls = filteredLinks.urls
      .map((item) => item.href)
      .join("\n");

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Extract the highest quality valid download URL from the list below. 
          Ignore links related to ringtones or low-quality songs. Provide only the best valid download URL.
          - Base URL: ${filteredLinks.sourceSite}
          - URLs: ${formattedUrls}
        `;

    const result = await model.generateContent(prompt);
    const data = result.response.text();

    return {
      statusCode: 200,
      body: JSON.stringify({ data }),
    };
  } catch (error) {
    console.error("Error during processing:", error.message, error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
