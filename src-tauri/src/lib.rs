mod commands;
mod error;
mod slack;
mod state;

use state::AppState;
use tauri::Manager;
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
                .with_ansi(false),
        )
        .with(tracing_subscriber::filter::LevelFilter::from(filter))
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::new())
        .setup(|app| {
            // Get the main window and maximize it on startup
            if let Some(window) = app.get_webview_window("main") {
                window.maximize().unwrap_or_else(|e| {
                    tracing::warn!("Failed to maximize window: {}", e);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::save_token_secure,
            commands::auth::get_token_secure,
            commands::auth::delete_token_secure,
            commands::auth::save_workspace_secure,
            commands::auth::get_workspace_secure,
            commands::auth::mask_token,
            commands::auth::init_token_from_storage,
            commands::auth::migrate_tokens,
            commands::auth::get_current_user_id,
            commands::channels::save_favorite_channels,
            commands::channels::get_favorite_channels,
            commands::channels::save_recent_channels,
            commands::channels::get_recent_channels,
            commands::channels::get_dm_channels,
            commands::channels::check_dm_permissions,
            commands::channels::search_dm_messages,
            commands::emoji::get_emoji_list,
            commands::post::post_to_channel,
            commands::post::post_thread_reply,
            commands::post::check_posting_permissions,
            commands::reactions::add_reaction,
            commands::reactions::remove_reaction,
            commands::reactions::get_reactions,
            commands::search::search_messages,
            commands::search::search_messages_fast,
            commands::search::get_user_channels,
            commands::search::get_users,
            commands::search::test_connection,
            commands::search::get_all_users,
            commands::search::get_user_info,
            commands::search::batch_fetch_reactions,
            commands::search::fetch_reactions_progressive,
            commands::search::clear_reaction_cache,
            commands::debug::debug_user_info,
            commands::debug::debug_dm_channels,
            commands::debug::debug_missing_users,
            commands::debug::debug_problematic_users,
            commands::thread::get_thread,
            commands::thread::parse_slack_url_command,
            commands::thread::get_thread_from_url,
            commands::thread::open_in_slack,
            commands::url::open_urls_smart,
            commands::files::get_slack_file,
            commands::files::get_authenticated_file_url,
            commands::files::download_slack_file,
            commands::files::download_slack_file_with_options,
            commands::files::download_slack_files_batch,
            commands::files::select_download_folder,
            commands::files::create_file_data_url,
            commands::files::download_file_binary,
            commands::files::get_file_content,
            commands::upload::upload_file_to_slack,
            commands::upload::upload_clipboard_image,
            commands::upload::get_file_info,
            commands::upload::upload_files_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
