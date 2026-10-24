//! Inside a field, the WebView's own right-click menu keeps the editing items only (SAKU β.13 S-10 = L1, 統括 2026-10-23):
//! cut, copy, paste, select all, undo, redo, spelling and emoji. 「その他のツール」 and every other item are removed, and so
//! are the separators left at either end or next to each other. Outside a field the page stops the menu (L3,
//! tools/unified-v1/context-menu-guard.mjs).
//!
//! WebView2 documents no list of item names, only their rule (the English label in lower camel case, e.g. "saveAs").
//! The names kept here are checked on the shipped exe (RC keying R-13). A name not in the list is removed: the menu
//! loses an item rather than keeps a tool.

/// The items kept, by their WebView2 name.
pub const KEPT: &[&str] = &["cut", "copy", "paste", "selectAll", "undo", "redo", "spellCheck", "emoji"];

/// The positions to remove from a menu of (name, is_separator) items, highest first (so removing them in order keeps
/// the lower positions valid).
pub fn removals(items: &[(String, bool)]) -> Vec<usize> {
    let mut keep: Vec<bool> = items.iter().map(|(name, separator)| *separator || KEPT.contains(&name.as_str())).collect();
    // A separator stays only between two kept items: not first, not after another separator, not last.
    let mut after_item = false;
    for (index, (_, separator)) in items.iter().enumerate() {
        if !keep[index] {
            continue;
        }
        if *separator {
            if after_item {
                after_item = false;
            } else {
                keep[index] = false;
            }
        } else {
            after_item = true;
        }
    }
    if let Some(last) = (0..items.len()).rev().find(|&index| keep[index]) {
        if items[last].1 {
            keep[last] = false;
        }
    }
    (0..items.len()).rev().filter(|&index| !keep[index]).collect()
}

/// Register the rule on the window's WebView2. An error leaves WebView2's own menu as it is (the page's rule still
/// stops it outside the fields).
#[cfg(windows)]
pub fn install(webview: &tauri::webview::PlatformWebview) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_11, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR,
    };
    use webview2_com::{take_pwstr, ContextMenuRequestedEventHandler};
    use windows::core::{Interface, PWSTR};

    unsafe {
        let core = webview.controller().CoreWebView2().map_err(|error| error.to_string())?;
        let core: ICoreWebView2_11 = core.cast().map_err(|error| error.to_string())?;
        let handler = ContextMenuRequestedEventHandler::create(Box::new(|_sender, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let items = args.MenuItems()?;
            let mut count = 0u32;
            items.Count(&mut count)?;
            let mut menu = Vec::with_capacity(count as usize);
            for index in 0..count {
                let item = items.GetValueAtIndex(index)?;
                let mut name = PWSTR::null();
                item.Name(&mut name)?;
                let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND::default();
                item.Kind(&mut kind)?;
                menu.push((take_pwstr(name), kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR));
            }
            for index in removals(&menu) {
                items.RemoveValueAtIndex(index as u32)?;
            }
            Ok(())
        }));
        let mut token = 0i64;
        core.add_ContextMenuRequested(&handler, &mut token).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn menu(items: &[&str]) -> Vec<(String, bool)> {
        items.iter().map(|name| (name.to_string(), *name == "|")).collect()
    }
    fn kept(items: &[&str]) -> Vec<String> {
        let list = menu(items);
        let gone = removals(&list);
        list.iter().enumerate().filter(|(index, _)| !gone.contains(index)).map(|(_, (name, _))| name.clone()).collect()
    }

    #[test]
    fn edit_menu_keeps_the_editing_items_and_drops_the_tools() {
        assert_eq!(
            kept(&["emoji", "|", "undo", "redo", "|", "cut", "copy", "paste", "|", "selectAll", "|", "other", "inspectElement"]),
            vec!["emoji", "|", "undo", "redo", "|", "cut", "copy", "paste", "|", "selectAll"]
        );
    }

    #[test]
    fn edit_menu_drops_an_unknown_name() {
        assert_eq!(kept(&["copy", "moreTools", "saveAs", "print"]), vec!["copy"]);
    }

    #[test]
    fn edit_menu_leaves_no_separator_at_an_end_or_doubled() {
        assert_eq!(kept(&["|", "back", "|", "copy", "|", "|", "paste", "|", "reload"]), vec!["copy", "|", "paste"]);
        assert!(kept(&["|", "back", "|", "reload", "|"]).is_empty());
    }

    #[test]
    fn edit_menu_removes_from_the_highest_position_first() {
        let list = menu(&["inspectElement", "copy", "print"]);
        assert_eq!(removals(&list), vec![2, 0]);
    }
}
