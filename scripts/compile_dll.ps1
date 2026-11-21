$cs = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Text.RegularExpressions;

public class WinAutomate {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    public delegate bool EnumDesktopWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumDesktopWindowsProc lpfn, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll")]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern void SwitchToThisWindow(IntPtr hWnd, bool fUnknown);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsIconic(IntPtr hWnd);

    public static bool AttachAndFocus(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;

        try {
            IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);
            if (hDesk != IntPtr.Zero) {
                SetThreadDesktop(hDesk);
                CloseDesktop(hDesk);
            }
        } catch {}

        if (IsIconic(hWnd)) {
            ShowWindow(hWnd, 9); // SW_RESTORE
        } else {
            ShowWindow(hWnd, 5); // SW_SHOW
        }

        uint foregroundThreadId = 0;
        IntPtr fgHwnd = GetForegroundWindow();
        if (fgHwnd != IntPtr.Zero) {
            GetWindowThreadProcessId(fgHwnd, out foregroundThreadId);
        }
        uint currentThreadId = GetCurrentThreadId();

        if (foregroundThreadId != 0 && foregroundThreadId != currentThreadId) {
            AttachThreadInput(currentThreadId, foregroundThreadId, true);
        }

        keybd_event(0x12, 0, 0, UIntPtr.Zero); // Alt down
        keybd_event(0x12, 0, 2, UIntPtr.Zero); // Alt up

        SwitchToThisWindow(hWnd, true);
        bool success = SetForegroundWindow(hWnd);

        if (foregroundThreadId != 0 && foregroundThreadId != currentThreadId) {
            AttachThreadInput(currentThreadId, foregroundThreadId, false);
        }

        return success;
    }

    public static IntPtr FindDesktopWindow(string pattern, out string matchedTitle) {
        IntPtr found = IntPtr.Zero;
        string foundTitle = "";
        IntPtr hDesk = IntPtr.Zero;
        try {
            hDesk = OpenInputDesktop(0, false, 0x0100 /* DESKTOP_ENUMERATE */);
            EnumDesktopWindows(hDesk, (hWnd, lParam) => {
                if (IsWindowVisible(hWnd)) {
                    StringBuilder sb = new StringBuilder(512);
                    GetWindowText(hWnd, sb, sb.Capacity);
                    string title = sb.ToString().Trim();
                    if (!string.IsNullOrEmpty(title) &&
                        !title.Contains("Antigravity") &&
                        !title.Contains("Visual Studio") &&
                        Regex.IsMatch(title, pattern, RegexOptions.IgnoreCase)) {
                        found = hWnd;
                        foundTitle = title;
                        return false;
                    }
                }
                return true;
            }, IntPtr.Zero);
        } catch {}
        finally {
            if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
        }
        matchedTitle = foundTitle;
        return found;
    }

    public static IntPtr FindBrowserWindow(out string matchedTitle) {
        string localFoundTitle = "";
        IntPtr found = IntPtr.Zero;

        // Try to find YouTube tab/window specifically (strictly excluding Zoya, Antigravity, and dev tools)
        IntPtr hDesk = IntPtr.Zero;
        try {
            hDesk = OpenInputDesktop(0, false, 0x0100);
            EnumDesktopWindows(hDesk, (hWnd, lParam) => {
                if (IsWindowVisible(hWnd)) {
                    StringBuilder sb = new StringBuilder(512);
                    GetWindowText(hWnd, sb, sb.Capacity);
                    string title = sb.ToString().Trim();
                    if (!string.IsNullOrEmpty(title) &&
                        !title.Contains("Antigravity") &&
                        !title.Contains("Visual Studio") &&
                        !title.Contains("Cursor") &&
                        title.IndexOf("Zoya", StringComparison.OrdinalIgnoreCase) < 0 &&
                        title.IndexOf("YouTube", StringComparison.OrdinalIgnoreCase) >= 0) {
                        found = hWnd;
                        localFoundTitle = title;
                        return false;
                    }
                }
                return true;
            }, IntPtr.Zero);
        } catch {}
        finally {
            if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
        }

        matchedTitle = localFoundTitle;
        return found;
    }
}
'@

$outPath = Join-Path $PSScriptRoot "WinAutomate.dll"
Add-Type -TypeDefinition $cs -OutputAssembly $outPath -OutputType Library
Write-Output "Successfully compiled to $outPath"
