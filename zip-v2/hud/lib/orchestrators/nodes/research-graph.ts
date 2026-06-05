/**
 * Research sub-graph for LangGraph orchestration
 * 
 * Handles research requests: web_search → fetch_url → summarize_sources
 * 
 * Uses LangGraph v1 patterns for stateful orchestration following 2026 best practices.
 */
import type { OrchestrationState } from "../types";
import { webSearch } from "@/lib/tools/implementations/web-search";
import { fetchUrl } from "@/lib/tools/implementations/web-fetch";
import { summarizeSources } from "@/lib/tools/implementations/web-summarize";
import type { ActivityTracker } from "../utils/activity-tracker";
import type { OrchestrationCallbacks } from "../brain";

// Internal state for passing data between nodes
interface ResearchInternalState {
  searchResults?: Awaited<ReturnType<typeof webSearch>>;
  fetchedContents?: Array<Awaited<ReturnType<typeof fetchUrl>>>;
}

/**
 * Web search node
 */
export async function webSearchNode(
  state: OrchestrationState,
  activityTracker?: ActivityTracker | null
): Promise<Partial<OrchestrationState> & { _internal?: ResearchInternalState }> {
  const nodeStartTime = Date.now();
  const query = state.userMessage;
  
  console.log(`[LANGGRAPH] [${state.requestId}] [RESEARCH] [WEB_SEARCH] Starting web search: ${query.substring(0, 100)}`);

  if (activityTracker) {
    activityTracker.emitToolStart("web_search", { query, maxResults: 5 }, state.requestId);
  }

  const searchResult = await webSearch({
    query,
    maxResults: 5,
  });

  const nodeDuration = Date.now() - nodeStartTime;
  console.log(`[LANGGRAPH] [${state.requestId}] [RESEARCH] [WEB_SEARCH] Search completed (${nodeDuration}ms, ${searchResult.results.length} results)`);

  if (activityTracker) {
    activityTracker.emitToolComplete("web_search", searchResult, state.requestId);
  }

  if (searchResult.results.length === 0) {
    return {
      researchResult: {
        summary: "No results found for your query.",
        citations: [],
        sources: [],
      },
    };
  }

  // Store search results internally for next node
  return {
    _internal: {
      searchResults: searchResult,
    },
  };
}

/**
 * Fetch URLs node
 */
export async function fetchUrlsNode(
  state: OrchestrationState & { _internal?: ResearchInternalState },
  activityTracker?: ActivityTracker | null
): Promise<Partial<OrchestrationState> & { _internal?: ResearchInternalState }> {
  const nodeStartTime = Date.now();
  const searchResults = state._internal?.searchResults;

  if (!searchResults || searchResults.results.length === 0) {
    console.log(`[LANGGRAPH] [${state.requestId}] [RESEARCH] [FETCH_URLS] No search results to fetch`);
    return {};
  }

  // Fetch top 3 URLs
  const urlsToFetch = searchResults.results.slice(0, 3);
  console.log(`[LANGGRAPH] [${state.requestId}] [RESEARCH] [FETCH_URLS] Fetching ${urlsToFetch.length} URLs`);
  
  if (activityTracker) {
    activityTracker.emitToolStart("fetch_url", { urls: urlsToFetch.map(r => r.url) }, state.requestId);
  }

  const fetchPromises = urlsToFetch.map((result) =>
    fetchUrl({ url: result.url, maxSize: 1048576 }).catch((error) => {
      console.error(`Failed to fetch ${result.url}:`, error);
      return null;
    })
  );

  const fetchedContents = await Promise.all(fetchPromises);

  const nodeDuration = Date.now() - nodeStartTime;
  const fetchedCount = fetchedContents.filter(c => c !== null).length;
  console.log(`[LANGGRAPH] [${state.requestId}] [RESEARCH] [FETCH_URLS] Fetch completed (${nodeDuration}ms, ${fetchedCount}/${urlsToFetch.length} successful)`);

  if (activityTracker) {
    activityTracker.emitToolComplete("fetch_url", { fetched: fetchedCount }, state.requestId);
  }
  const validContents = fetchedContents.filter(
    (c): c is Awaited<ReturnType<typeof fetchUrl>> => c !== null
  );

  if (validContents.length === 0) {
    return {
      researchResult: {
        summary: "Found search results but unable to fetch content.",
        citations: searchResults.results.map((r) => ({
          url: r.url,
          title: r.title,
          quote: r.snippet,
        })),
        sources: searchResults.results,
      },
    };
  }

  // Store fetched contents for summarize node
  return {
    _internal: {
      ...state._internal,
      fetchedContents: validContents,
    },
  };
}

/**
 * Summarize sources node
 */
export async function summarizeNode(
  state: OrchestrationState & { _internal?: ResearchInternalState },
  activityTracker?: ActivityTracker | null,
  callbacks?: OrchestrationCallbacks | null
): Promise<Partial<OrchestrationState>> {
  const nodeStartTime = Date.now();
  const fetchedContents = state._internal?.fetchedContents;
  const searchResults = state._internal?.searchResults;

  if (!fetchedContents || fetchedContents.length === 0) {
    console.log(`[LANGGRAPH] [${state.requestId}] [RESEARCH] [SUMMARIZE] No fetched contents to summarize`);
    return {
      researchResult: {
        summary: "Unable to fetch content for summarization.",
        citations: [],
        sources: searchResults?.results || [],
      },
    };
  }

  const sources = fetchedContents.map((content: Awaited<ReturnType<typeof fetchUrl>>) => ({
    title: content.title,
    url: content.url,
    content: content.content,
    snippet: content.content.substring(0, 200),
  }));

  console.log(`[LANGGRAPH] [${state.requestId}] [RESEARCH] [SUMMARIZE] Summarizing ${sources.length} sources`);

  if (activityTracker) {
    const model = process.env.OPENAI_RESPONSES_MODEL || "gpt-4o";
    activityTracker.emitLLMCall(model, `Summarizing ${sources.length} sources`, state.requestId);
    activityTracker.emitToolStart("summarize_sources", { sourcesCount: sources.length }, state.requestId);
  }

  const summaryResult = await summarizeSources({
    sources,
    query: state.userMessage,
  });

  const nodeDuration = Date.now() - nodeStartTime;
  console.log(`[LANGGRAPH] [${state.requestId}] [RESEARCH] [SUMMARIZE] Summarization completed (${nodeDuration}ms, ${summaryResult.citations.length} citations)`);

  if (activityTracker) {
    activityTracker.emitToolComplete("summarize_sources", summaryResult, state.requestId);
  }

  return {
    researchResult: {
      summary: summaryResult.summary,
      citations: summaryResult.citations,
      sources: searchResults?.results || [],
    },
  };
}

/**
 * Execute research workflow (maintains backward compatibility with existing interface)
 * This is a sequential execution that mimics the graph structure
 */
export async function executeResearchGraph(
  query: string,
  requestId?: string,
  activityTracker?: ActivityTracker | null,
  callbacks?: OrchestrationCallbacks | null
): Promise<{
  summary: string;
  citations: Array<{ url: string; title: string; quote: string }>;
  sources: Array<{ title: string; url: string; snippet: string }>;
}> {
  const graphStartTime = Date.now();
  const reqId = requestId || `req_${Date.now()}`;
  
  console.log(`[LANGGRAPH] [${reqId}] [RESEARCH] Starting research graph execution`);
  
  const initialState: OrchestrationState & { _internal?: ResearchInternalState } = {
    userMessage: query,
    conversationHistory: [],
    toolResults: [],
    requestId: reqId,
  };

  // Execute nodes sequentially (graph will be wired up in main orchestration)
  const step1 = await webSearchNode(initialState, activityTracker);
  const state1 = { ...initialState, ...step1 };

  const step2 = await fetchUrlsNode(state1, activityTracker);
  const state2 = { ...state1, ...step2 };

  const step3 = await summarizeNode(state2, activityTracker, callbacks);
  
  const graphDuration = Date.now() - graphStartTime;
  console.log(`[LANGGRAPH] [${reqId}] [RESEARCH] Research graph execution completed (${graphDuration}ms)`);

  const finalState = { ...state2, ...step3 };

  if (!finalState.researchResult) {
    return {
      summary: "Research completed but no results.",
      citations: [],
      sources: [],
    };
  }

  return {
    summary: finalState.researchResult.summary,
    citations: finalState.researchResult.citations,
    sources: finalState.researchResult.sources,
  };
}

