//! The app's own code signature, read on the spot (2026-10-14 keying F1; Owner 結果 190 対策 D; 統括 approval).
//!
//! Facts only: whether Windows trusts the running exe's Authenticode signature, and who signed it. The page decides
//! what to show (tools/unified-v1/code-signature.mjs), so that decision — and every mutation of it — is tested without
//! Windows. Nothing here says "signed by WI-T.COM"; a fact that could not be read is reported as UNAVAILABLE.
//!
//! The check stays on this PC: revocation is not checked online (WTD_REVOKE_NONE) and URL retrieval is cache only
//! (WTD_CACHE_ONLY_URL_RETRIEVAL). It runs on its own thread after the window is created (main.rs), so it never delays
//! the first screen; the page shows 「確かめています」 until it has an answer and 「確かめられない」 if none comes.
use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct SignatureFacts {
    /// "TRUSTED" (WinVerifyTrust returned 0), "NO_SIGNATURE" (TRUST_E_NOSIGNATURE), "NOT_TRUSTED" (any other result),
    /// "UNAVAILABLE" (the check could not run: not Windows, no exe path).
    pub trust: &'static str,
    pub hresult: i32,
    /// The leaf signer's subject CN and O, as Windows reads them ("" when there is none or it cannot be read).
    pub signer_cn: String,
    pub signer_o: String,
}

pub fn unavailable() -> SignatureFacts {
    SignatureFacts { trust: "UNAVAILABLE", hresult: 0, signer_cn: String::new(), signer_o: String::new() }
}

/// The trust word for a WinVerifyTrust result. Pure, so the mapping is tested on any platform.
pub fn trust_word(result: i32) -> &'static str {
    const TRUST_E_NOSIGNATURE: i32 = 0x800B0100_u32 as i32;
    if result == 0 {
        "TRUSTED"
    } else if result == TRUST_E_NOSIGNATURE {
        "NO_SIGNATURE"
    } else {
        "NOT_TRUSTED"
    }
}

#[cfg(windows)]
pub fn read_own_signature() -> SignatureFacts {
    match std::env::current_exe() {
        Ok(exe) => read_signature(&exe),
        Err(_) => unavailable(),
    }
}

#[cfg(not(windows))]
pub fn read_own_signature() -> SignatureFacts {
    unavailable()
}

#[cfg(windows)]
pub fn read_signature(path: &std::path::Path) -> SignatureFacts {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Security::WinTrust::{
        WinVerifyTrust, WINTRUST_ACTION_GENERIC_VERIFY_V2, WINTRUST_DATA, WINTRUST_FILE_INFO, WTD_CACHE_ONLY_URL_RETRIEVAL,
        WTD_CHOICE_FILE, WTD_REVOKE_NONE, WTD_STATEACTION_CLOSE, WTD_STATEACTION_VERIFY, WTD_UI_NONE,
    };
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let mut file = WINTRUST_FILE_INFO {
        cbStruct: std::mem::size_of::<WINTRUST_FILE_INFO>() as u32,
        pcwszFilePath: wide.as_ptr(),
        ..Default::default()
    };
    let mut data = WINTRUST_DATA::default();
    data.cbStruct = std::mem::size_of::<WINTRUST_DATA>() as u32;
    data.dwUIChoice = WTD_UI_NONE;
    data.fdwRevocationChecks = WTD_REVOKE_NONE;
    data.dwUnionChoice = WTD_CHOICE_FILE;
    data.Anonymous.pFile = &mut file;
    data.dwStateAction = WTD_STATEACTION_VERIFY;
    data.dwProvFlags = WTD_CACHE_ONLY_URL_RETRIEVAL;
    let mut action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
    // SAFETY: data and file outlive both calls; the state is closed with the same action and data.
    let result = unsafe { WinVerifyTrust(std::ptr::null_mut(), &mut action, &mut data as *mut WINTRUST_DATA as *mut core::ffi::c_void) };
    let (signer_cn, signer_o) = unsafe { signer_names(data.hWVTStateData) };
    data.dwStateAction = WTD_STATEACTION_CLOSE;
    unsafe { WinVerifyTrust(std::ptr::null_mut(), &mut action, &mut data as *mut WINTRUST_DATA as *mut core::ffi::c_void) };
    SignatureFacts { trust: trust_word(result), hresult: result, signer_cn, signer_o }
}

/// The leaf signer's CN and O from the verification state ("" for anything that is not there).
#[cfg(windows)]
unsafe fn signer_names(state: windows_sys::Win32::Foundation::HANDLE) -> (String, String) {
    use windows_sys::Win32::Security::Cryptography::{szOID_COMMON_NAME, szOID_ORGANIZATION_NAME};
    use windows_sys::Win32::Security::WinTrust::{WTHelperGetProvSignerFromChain, WTHelperProvDataFromStateData};
    if state.is_null() {
        return (String::new(), String::new());
    }
    // SAFETY: the state is the open verification state; every pointer is checked before it is read.
    unsafe {
        let provider = WTHelperProvDataFromStateData(state);
        if provider.is_null() {
            return (String::new(), String::new());
        }
        let signer = WTHelperGetProvSignerFromChain(provider, 0, 0, 0);
        if signer.is_null() || (*signer).csCertChain == 0 || (*signer).pasCertChain.is_null() {
            return (String::new(), String::new());
        }
        let cert = (*(*signer).pasCertChain).pCert;
        if cert.is_null() {
            return (String::new(), String::new());
        }
        (subject_attribute(cert, szOID_COMMON_NAME), subject_attribute(cert, szOID_ORGANIZATION_NAME))
    }
}

#[cfg(windows)]
unsafe fn subject_attribute(cert: *const windows_sys::Win32::Security::Cryptography::CERT_CONTEXT, oid: windows_sys::core::PCSTR) -> String {
    use windows_sys::Win32::Security::Cryptography::{CertGetNameStringW, CERT_NAME_ATTR_TYPE};
    let mut buffer = [0u16; 256];
    // SAFETY: cert comes from the verification state, still open; the buffer length is passed.
    let written = unsafe { CertGetNameStringW(cert, CERT_NAME_ATTR_TYPE, 0, oid as *const core::ffi::c_void, buffer.as_mut_ptr(), buffer.len() as u32) };
    // The count includes the terminating zero; 1 means an empty name.
    if written <= 1 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..(written as usize - 1)])
}
