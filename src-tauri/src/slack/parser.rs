use anyhow::{anyhow, Result};
use regex::Regex;
use url::Url;
use super::models::ParsedUrl;

/// Parse a Slack URL to extract channel ID, message timestamp, and thread timestamp
/// 
/// Supported URL formats:
/// - https://workspace.slack.com/archives/C1234567890/p1234567890123456
/// - https://workspace.slack.com/archives/C1234567890/p1234567890123456?thread_ts=1234567890.123456
pub fn parse_slack_url(url_str: &str) -> Result<ParsedUrl> {
    let url = Url::parse(url_str)?;
    
    // Check if it's a Slack URL
    if !url.host_str().map_or(false, |h| h.ends_with("slack.com")) {
        return Err(anyhow!("Not a valid Slack URL"));
    }
    
    // Extract path segments
    let path = url.path();
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    
    // We expect at least 3 segments: archives, channel_id, message_ts
    if segments.len() < 3 {
        return Err(anyhow!("Invalid Slack URL format"));
    }
    
    // Check if it's an archives URL
    if segments[0] != "archives" {
        return Err(anyhow!("URL must be an archives URL"));
    }
    
    let channel_id = segments[1].to_string();
    let message_id = segments[2].to_string();
    
    // Validate channel ID format (starts with C, D, or G)
    if !channel_id.starts_with('C') && !channel_id.starts_with('D') && !channel_id.starts_with('G') {
        return Err(anyhow!("Invalid channel ID format"));
    }
    
    // Convert message ID from p-format to timestamp
    let message_ts = convert_message_id_to_ts(&message_id)?;
    
    // Check for thread_ts in query parameters
    let thread_ts = url.query_pairs()
        .find(|(key, _)| key == "thread_ts")
        .map(|(_, value)| value.to_string());
    
    Ok(ParsedUrl {
        channel_id,
        message_ts,
        thread_ts,
    })
}

/// Convert Slack's p-format message ID to timestamp format
/// 
/// Example: p1234567890123456 -> 1234567890.123456
fn convert_message_id_to_ts(message_id: &str) -> Result<String> {
    if !message_id.starts_with('p') {
        return Err(anyhow!("Message ID must start with 'p'"));
    }
    
    let id_without_p = &message_id[1..];
    
    // Validate that it's all digits
    if !id_without_p.chars().all(|c| c.is_ascii_digit()) {
        return Err(anyhow!("Invalid message ID format"));
    }
    
    // Split into seconds and microseconds
    // Slack timestamps are in the format: seconds.microseconds
    // The p-format concatenates them: p{seconds}{microseconds}
    if id_without_p.len() < 16 {
        return Err(anyhow!("Message ID too short"));
    }
    
    let (seconds, microseconds) = id_without_p.split_at(10);
    Ok(format!("{}.{}", seconds, microseconds))
}

/// Convert timestamp to p-format message ID
/// 
/// Example: 1234567890.123456 -> p1234567890123456
#[allow(dead_code)]
pub fn convert_ts_to_message_id(ts: &str) -> Result<String> {
    let parts: Vec<&str> = ts.split('.').collect();
    if parts.len() != 2 {
        return Err(anyhow!("Invalid timestamp format"));
    }
    
    Ok(format!("p{}{}", parts[0], parts[1]))
}

/// Extract channel name from a Slack channel mention
/// 
/// Example: #general -> general, <#C1234567890|general> -> general
#[allow(dead_code)]
pub fn extract_channel_name(text: &str) -> Option<String> {
    // Handle simple channel name
    if text.starts_with('#') {
        return Some(text[1..].to_string());
    }
    
    // Handle Slack's channel mention format: <#C1234567890|channel-name>
    let re = Regex::new(r"<#[A-Z0-9]+\|([^>]+)>").ok()?;
    re.captures(text)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
}

/// Extract user name from a Slack user mention
/// 
/// Example: @user -> user, <@U1234567890> -> U1234567890
#[allow(dead_code)]
pub fn extract_user_name(text: &str) -> Option<String> {
    // Handle simple user name
    if text.starts_with('@') {
        return Some(text[1..].to_string());
    }
    
    // Handle Slack's user mention format: <@U1234567890>
    let re = Regex::new(r"<@([A-Z0-9]+)>").ok()?;
    re.captures(text)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
}

/// Build a Slack archive URL from components
#[allow(dead_code)]
pub fn build_slack_url(workspace: &str, channel_id: &str, message_ts: &str, thread_ts: Option<&str>) -> String {
    let message_id = convert_ts_to_message_id(message_ts).unwrap_or_else(|_| format!("p{}", message_ts.replace('.', "")));
    
    let base_url = format!(
        "https://{}.slack.com/archives/{}/{}",
        workspace, channel_id, message_id
    );
    
    if let Some(thread) = thread_ts {
        format!("{}?thread_ts={}", base_url, thread)
    } else {
        base_url
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_slack_url() {
        let url = "https://workspace.slack.com/archives/C1234567890/p1234567890123456";
        let parsed = parse_slack_url(url).unwrap();
        assert_eq!(parsed.channel_id, "C1234567890");
        assert_eq!(parsed.message_ts, "1234567890.123456");
        assert_eq!(parsed.thread_ts, None);
    }

    #[test]
    fn test_parse_slack_url_with_thread() {
        let url = "https://workspace.slack.com/archives/C1234567890/p1234567890123456?thread_ts=1234567890.123456";
        let parsed = parse_slack_url(url).unwrap();
        assert_eq!(parsed.channel_id, "C1234567890");
        assert_eq!(parsed.message_ts, "1234567890.123456");
        assert_eq!(parsed.thread_ts, Some("1234567890.123456".to_string()));
    }

    #[test]
    fn test_convert_message_id_to_ts() {
        let message_id = "p1234567890123456";
        let ts = convert_message_id_to_ts(message_id).unwrap();
        assert_eq!(ts, "1234567890.123456");
    }

    #[test]
    fn test_convert_ts_to_message_id() {
        let ts = "1234567890.123456";
        let message_id = convert_ts_to_message_id(ts).unwrap();
        assert_eq!(message_id, "p1234567890123456");
    }

    #[test]
    fn test_extract_channel_name() {
        assert_eq!(extract_channel_name("#general"), Some("general".to_string()));
        assert_eq!(extract_channel_name("<#C1234567890|general>"), Some("general".to_string()));
    }

    #[test]
    fn test_extract_user_name() {
        assert_eq!(extract_user_name("@john"), Some("john".to_string()));
        assert_eq!(extract_user_name("<@U1234567890>"), Some("U1234567890".to_string()));
    }
}