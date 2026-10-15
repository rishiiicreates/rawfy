mod api;
mod mcp;

use clap::{Parser, Subcommand};
use rawfy_core::{
    output::{serialize_json, serialize_text, serialize_wsm},
    types::{OutputFormat, RawfyOptions},
};
use std::io::{self, Read, Write};
use std::path::PathBuf;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Parser)]
#[command(
    name = "rawfy",
    version = VERSION,
    about = "Universal web perception skill for AI agents in Rust",
    long_about = "Fast, lightweight web perception engine that converts any URL into structured, agent-readable markdown (WSM), JSON, or clean text with described images, transcribed video, and interactive element maps."
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Direct URL argument (shorthand for 'rawfy fetch <url>')
    #[arg(value_name = "URL")]
    url: Option<String>,

    /// Output format: markdown, json, text, html (default: markdown)
    #[arg(short = 'f', long, global = true, default_value = "markdown")]
    format: String,

    /// Enable AI-powered image descriptions via Vision API
    #[arg(long, global = true)]
    vision: bool,

    /// Vision provider override (gemini, openai, anthropic, auto)
    #[arg(long, global = true)]
    vision_provider: Option<String>,

    /// Vision model override (e.g. gemini-2.5-flash, gpt-4o-mini, claude-3-5-haiku-20241022)
    #[arg(long, global = true)]
    vision_model: Option<String>,

    /// Skip Playwright, use static HTTP fetch only
    #[arg(long, global = true)]
    no_playwright: bool,

    /// Force Playwright JS rendering
    #[arg(long, global = true)]
    force_playwright: bool,

    /// Maximum output tokens (default: 50000)
    #[arg(long, global = true)]
    max_tokens: Option<usize>,

    /// Fetch timeout in milliseconds (default: 15000)
    #[arg(long, global = true)]
    timeout: Option<u64>,

    /// Write output to file instead of stdout
    #[arg(short = 'o', long, global = true)]
    out: Option<PathBuf>,

    /// Extract only interactive links
    #[arg(long, global = true)]
    links_only: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Fetch and process a URL
    Fetch {
        /// The URL to fetch and convert
        #[arg(value_name = "URL")]
        url: Option<String>,
    },
    /// Start MCP (Model Context Protocol) stdio server
    Serve,
    /// Start local REST API server
    Api {
        /// Port to listen on (default: 3847)
        #[arg(short = 'p', long, default_value_t = 3847)]
        port: u16,
    },
    /// Print version information
    Version,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Serve) => {
            mcp::run_mcp_stdio_server().await?;
        }
        Some(Commands::Api { port }) => {
            api::start_api_server(port).await?;
        }
        Some(Commands::Version) => {
            println!("rawfy v{}", VERSION);
        }
        Some(Commands::Fetch { ref url }) => {
            let target_url = resolve_url(url.clone(), cli.url.clone())?;
            handle_fetch(target_url, &cli).await?;
        }
        None => {
            if let Some(ref target_url) = cli.url {
                handle_fetch(target_url.clone(), &cli).await?;
            } else {
                // If piped stdin exists, read URL from stdin
                if !stdin_is_terminal() {
                    let mut buffer = String::new();
                    io::stdin().read_to_string(&mut buffer)?;
                    let target_url = buffer.trim().to_string();
                    if !target_url.is_empty() {
                        handle_fetch(target_url, &cli).await?;
                        return Ok(());
                    }
                }
                eprintln!("rawfy error: missing URL or command. Run 'rawfy --help' for usage.");
                std::process::exit(1);
            }
        }
    }

    Ok(())
}

fn resolve_url(cmd_url: Option<String>, root_url: Option<String>) -> Result<String, Box<dyn std::error::Error>> {
    if let Some(u) = cmd_url {
        if !u.is_empty() {
            return Ok(u);
        }
    }
    if let Some(u) = root_url {
        if !u.is_empty() {
            return Ok(u);
        }
    }
    if !stdin_is_terminal() {
        let mut buffer = String::new();
        io::stdin().read_to_string(&mut buffer)?;
        let trimmed = buffer.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }
    Err("Missing URL argument. Usage: rawfy fetch <url>".into())
}

fn stdin_is_terminal() -> bool {
    std::io::IsTerminal::is_terminal(&std::io::stdin())
}

fn stderr_is_terminal() -> bool {
    std::io::IsTerminal::is_terminal(&std::io::stderr())
}

async fn handle_fetch(url: String, cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let format = cli.format.parse::<OutputFormat>().unwrap_or_default();
    let options = RawfyOptions {
        format,
        vision: cli.vision,
        vision_provider: cli.vision_provider.clone(),
        vision_model: cli.vision_model.clone(),
        no_playwright: cli.no_playwright,
        force_playwright: cli.force_playwright,
        max_tokens: cli.max_tokens,
        timeout_ms: cli.timeout,
        links_only: cli.links_only,
        out: cli.out.as_ref().map(|p| p.to_string_lossy().to_string()),
    };

    if stderr_is_terminal() {
        eprint!("  ⏳ Fetching {}...", url);
        io::stderr().flush().ok();
    }

    match rawfy_core::rawfy_fetch(&url, &options).await {
        Ok(data) => {
            if stderr_is_terminal() {
                eprint!("\r\x1b[2K\r"); // Clear spinner line
                io::stderr().flush().ok();
            }

            let output = match format {
                OutputFormat::Json => serialize_json(&data)?,
                OutputFormat::Html => data.content.html,
                OutputFormat::Text => serialize_text(&data),
                OutputFormat::Markdown => serialize_wsm(&data),
            };

            if let Some(ref path) = cli.out {
                std::fs::write(path, &output)?;
                if stderr_is_terminal() {
                    eprintln!("✅ Output written to {}", path.display());
                }
            } else {
                println!("{}", output);
            }

            if stderr_is_terminal() {
                eprintln!("\n⭐ If you like Rawfy, please star the repo on GitHub: https://github.com/rishiiicreates/rawfy");
            }
        }
        Err(err) => {
            if stderr_is_terminal() {
                eprint!("\r\x1b[2K\r");
                io::stderr().flush().ok();
            }
            eprintln!("rawfy error: {}", err);
            std::process::exit(1);
        }
    }

    Ok(())
}
