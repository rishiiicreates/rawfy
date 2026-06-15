# Using Rawfy with LangChain / LangGraph

Rawfy can be used as a tool in LangChain and LangGraph agents
via the Python wrapper.

## Install

```bash
npm install -g rawfy     # Node.js CLI
pip install rawfy        # Python wrapper
pip install langchain langchain-openai   # LangChain
```

## LangChain Tool

```python
from langchain.tools import tool
from rawfy import fetch, fetch_json, RawfyError


@tool
def rawfy_fetch(url: str) -> str:
    """Fetch a web page and return its content as structured markdown.
    Use this tool to read and understand any web page.
    Returns the page content with metadata, described images,
    and interactive element maps."""
    try:
        return fetch(url, format="markdown", max_tokens=30_000)
    except RawfyError as e:
        return f"Error fetching {url}: {e}"


@tool
def rawfy_metadata(url: str) -> str:
    """Get lightweight metadata for a web page (title, description, 
    type, word count). Use when you only need basic page info."""
    try:
        from rawfy import metadata
        meta = metadata(url)
        import json
        return json.dumps(meta, indent=2)
    except RawfyError as e:
        return f"Error fetching metadata for {url}: {e}"
```

## Use in an Agent

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate

llm = ChatOpenAI(model="gpt-4o")
tools = [rawfy_fetch, rawfy_metadata]

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant. Use the rawfy_fetch tool "
               "to read web pages when the user asks about URLs."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

result = executor.invoke({
    "input": "Read https://example.com and summarize the page."
})
print(result["output"])
```

## LangGraph Integration

```python
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o")
tools = [rawfy_fetch, rawfy_metadata]

agent = create_react_agent(llm, tools)

result = agent.invoke({
    "messages": [
        {"role": "user", "content": "What is on https://example.com?"}
    ]
})
```

## Tips

- Use `max_tokens=30000` in LangChain to stay within context limits
- Use `rawfy_metadata` first to check page size before full fetch
- Set `no_playwright=True` for faster results on static pages
- The `format="json"` option returns structured data for programmatic use
