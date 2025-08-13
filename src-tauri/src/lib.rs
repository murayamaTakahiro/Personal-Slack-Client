mod commands;
mod error;
mod slack;
mod state;

use state::AppState;
use tracing_subscriber;
use tracing_subscriber::fmt;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging with better formatting and debug output
    let filter = if cfg!(debug_assertions) {
        tracing::Level::DEBUG
    } else {
        tracing::Level::INFO
    };
    
    tracing_subscriber::registry()
        .with(
            fmt::layer()
                .with_target(false)
                .with_thread_ids(false)
                .with_thread_names(false)
                .with_file(true)
                .with_line_number(true)
                .with_level(true)
                .with_ansi(false)
        )
        .with(tracing_subscriber::filter::LevelFilter::from(filter))
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::auth::save_token_secure,
            commands::auth::get_token_secure,
            commands::auth::delete_token_secure,
            commands::auth::save_workspace_secure,
            commands::auth::get_workspace_secure,
            commands::auth::mask_token,
            commands::auth::init_token_from_storage,
            commands::auth::migrate_tokens,
            commands::channels::save_favorite_channels,
            commands::channels::get_favorite_channels,
            commands::channels::save_recent_channels,
            commands::channels::get_recent_channels,
            commands::search::search_messages,
            commands::search::get_user_channels,
            commands::search::test_connection,
            commands::search::get_all_users,
            commands::search::get_user_info,
            commands::thread::get_thread,
            commands::thread::parse_slack_url_command,
            commands::thread::get_thread_from_url,
            commands::thread::open_in_slack,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
