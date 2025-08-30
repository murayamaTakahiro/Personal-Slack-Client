#[cfg(test)]
mod tests {
    use crate::state::CachedUser;
    use regex::Regex;
    use std::collections::HashMap;

    fn replace_user_mentions_old(text: &str, user_cache: &HashMap<String, CachedUser>) -> String {
        let mut result = text.to_string();

        // Current regex - only matches <@USERID>
        let re = Regex::new(r"<@(U[A-Z0-9]+)>").unwrap();

        for cap in re.captures_iter(text) {
            if let Some(user_id) = cap.get(1) {
                let user_id_str = user_id.as_str();
                if let Some(cached_user) = user_cache.get(user_id_str) {
                    let replacement = format!("@{}", cached_user.name);
                    let original = format!("<@{}>", user_id_str);
                    result = result.replace(&original, &replacement);
                }
            }
        }

        result
    }

    fn replace_user_mentions_new(text: &str, user_cache: &HashMap<String, CachedUser>) -> String {
        let mut result = text.to_string();

        // New regex - matches both <@USERID> and <@USERID|username>
        let re = Regex::new(r"<@(U[A-Z0-9]+)(?:\|([^>]+))?>").unwrap();

        for cap in re.captures_iter(text) {
            let user_id = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let display_name = cap.get(2).map(|m| m.as_str());

            let replacement = if let Some(name) = display_name {
                // If we have the display name in the mention, use it directly
                format!("@{}", name)
            } else if let Some(cached_user) = user_cache.get(user_id) {
                // Otherwise, look up the user in cache
                format!("@{}", cached_user.name)
            } else {
                // Fallback: keep the user ID
                format!("@{}", user_id)
            };

            let original = cap.get(0).map(|m| m.as_str()).unwrap_or("");
            result = result.replace(original, &replacement);
        }

        result
    }

    #[test]
    fn test_user_mention_formats() {
        // Create a mock user cache
        let mut user_cache = HashMap::new();
        user_cache.insert(
            "U03KRLTFQ".to_string(),
            CachedUser {
                name: "john.cached".to_string(),
                real_name: None,
                cached_at: 0,
            },
        );
        user_cache.insert(
            "U04ABCDEF".to_string(),
            CachedUser {
                name: "jane.cached".to_string(),
                real_name: None,
                cached_at: 0,
            },
        );

        // Test cases that demonstrate the issue
        let test_cases = vec![
            (
                "Hello <@U03KRLTFQ>!",
                "Hello @john.cached!",
                "Test basic mention",
            ),
            (
                "Hello <@U03KRLTFQ|john.doe>!",
                "Hello <@U03KRLTFQ|john.doe>!", // Old regex doesn't match this
                "Test mention with display name (OLD FAILS)",
            ),
            (
                "Multiple: <@U03KRLTFQ|john> and <@U04ABCDEF|jane>",
                "Multiple: <@U03KRLTFQ|john> and <@U04ABCDEF|jane>", // Old regex doesn't match these
                "Test multiple mentions with names (OLD FAILS)",
            ),
            (
                "Mixed: <@U03KRLTFQ> and <@U04ABCDEF|jane.smith>",
                "Mixed: @john.cached and <@U04ABCDEF|jane.smith>", // Old regex only matches first
                "Test mixed formats (OLD PARTIAL)",
            ),
        ];

        println!("\nTesting OLD regex (current implementation):");
        println!("{}", "-".repeat(60));
        for (input, expected_old, desc) in &test_cases {
            let result = replace_user_mentions_old(input, &user_cache);
            println!("{}", desc);
            println!("  Input:    {}", input);
            println!("  Output:   {}", result);
            println!("  Expected: {}", expected_old);
            assert_eq!(&result, expected_old, "Old regex test failed for: {}", desc);
            println!();
        }

        // Now test with new regex
        let test_cases_new = vec![
            (
                "Hello <@U03KRLTFQ>!",
                "Hello @john.cached!",
                "Test basic mention",
            ),
            (
                "Hello <@U03KRLTFQ|john.doe>!",
                "Hello @john.doe!", // New regex uses the display name from mention
                "Test mention with display name",
            ),
            (
                "Multiple: <@U03KRLTFQ|john> and <@U04ABCDEF|jane>",
                "Multiple: @john and @jane", // New regex handles both
                "Test multiple mentions with names",
            ),
            (
                "Mixed: <@U03KRLTFQ> and <@U04ABCDEF|jane.smith>",
                "Mixed: @john.cached and @jane.smith", // New regex handles both formats
                "Test mixed formats",
            ),
        ];

        println!("\nTesting NEW regex (proposed fix):");
        println!("{}", "-".repeat(60));
        for (input, expected_new, desc) in &test_cases_new {
            let result = replace_user_mentions_new(input, &user_cache);
            println!("{}", desc);
            println!("  Input:    {}", input);
            println!("  Output:   {}", result);
            println!("  Expected: {}", expected_new);
            assert_eq!(&result, expected_new, "New regex test failed for: {}", desc);
            println!();
        }
    }
}
