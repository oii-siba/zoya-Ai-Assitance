
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

public class ZoyaFastControl {
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
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    public const byte VK_RETURN = 0x0D;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_W = 0x57;
    public const byte VK_L = 0x4C;
    public const byte VK_V = 0x56;
    public const byte VK_K = 0x4B;
    public const byte VK_SPACE = 0x20;
    public const byte VK_MEDIA_PLAY_PAUSE = 0xB3;
    public const byte VK_MEDIA_NEXT_TRACK = 0xB0;
    public const byte VK_MEDIA_PREV_TRACK = 0xB1;
    public const byte VK_VOLUME_MUTE = 0xAD;
    public const byte VK_VOLUME_DOWN = 0xAE;
    public const byte VK_VOLUME_UP = 0xAF;
    public const byte VK_PRIOR = 0x21; // Page Up
    public const byte VK_NEXT = 0x22;  // Page Down

    public const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;

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

        uint unusedPid = 0;
        uint foregroundThreadId = 0;
        IntPtr hForeground = GetForegroundWindow();
        if (hForeground != IntPtr.Zero) {
            foregroundThreadId = GetWindowThreadProcessId(hForeground, out unusedPid);
        }

        uint targetThreadId = GetWindowThreadProcessId(hWnd, out unusedPid);
        uint currentThreadId = GetCurrentThreadId();

        if (foregroundThreadId != 0 && foregroundThreadId != currentThreadId) {
            AttachThreadInput(currentThreadId, foregroundThreadId, true);
        }
        if (targetThreadId != 0 && targetThreadId != currentThreadId) {
            AttachThreadInput(currentThreadId, targetThreadId, true);
        }

        SetForegroundWindow(hWnd);
        SwitchToThisWindow(hWnd, true);
        bool success = SetForegroundWindow(hWnd);

        if (targetThreadId != 0 && targetThreadId != currentThreadId) {
            AttachThreadInput(currentThreadId, targetThreadId, false);
        }
        if (foregroundThreadId != 0 && foregroundThreadId != currentThreadId) {
            AttachThreadInput(currentThreadId, foregroundThreadId, false);
        }
        return success;
    }

    public static IntPtr FindBrowserWindow(out string matchedTitle) {
        string localFoundTitle = "";
        IntPtr found = IntPtr.Zero;

        // Try to find YouTube window specifically (strictly excluding Zoya, Antigravity, and dev tools)
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

    public static void SetClipboardText(string text) {
        if (string.IsNullOrEmpty(text)) return;
        try {
            Thread t = new Thread(() => {
                for (int i = 0; i < 5; i++) {
                    try {
                        Clipboard.SetText(text);
                        break;
                    } catch {
                        Thread.Sleep(30);
                    }
                }
            });
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
            t.Join(500);
        } catch {}
    }

    public static void NavigateCurrentTab(string url) {
        url = (url ?? "").Trim();
        if (string.IsNullOrEmpty(url)) {
            Console.WriteLine("ERROR: URL_EMPTY");
            return;
        }

        string title;
        IntPtr win = FindBrowserWindow(out title);
        if (win != IntPtr.Zero) {
            AttachAndFocus(win);
            Thread.Sleep(60);

            // Put URL on clipboard
            SetClipboardText(url);
            Thread.Sleep(30);

            // 1. Ctrl + L (Select address bar of existing YouTube tab)
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            keybd_event(VK_L, 0, 0, UIntPtr.Zero);
            Thread.Sleep(35);
            keybd_event(VK_L, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(40);

            // 2. Ctrl + V (Paste URL)
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            keybd_event(VK_V, 0, 0, UIntPtr.Zero);
            Thread.Sleep(35);
            keybd_event(VK_V, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(40);

            // 3. Enter (Navigate existing YouTube tab on SAME PAGE)
            keybd_event(VK_RETURN, 0, 0, UIntPtr.Zero);
            Thread.Sleep(35);
            keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

            Console.WriteLine("SUCCESS: Navigated current tab to " + url);
        } else {
            Console.WriteLine("NOTICE: NO_YOUTUBE_WINDOW_FOUND");
        }
    }

    public static void ScrollActivePage(int amount, string direction) {
        bool isUp = (direction == "up" || amount > 0);
        int wheelDelta = isUp ? (amount != 0 ? Math.Abs(amount) : 480) : -(amount != 0 ? Math.Abs(amount) : 480);

        IntPtr fg = GetForegroundWindow();
        if (fg != IntPtr.Zero) {
            AttachAndFocus(fg);
        }

        int steps = 4;
        int stepDelta = wheelDelta / steps;
        for (int i = 0; i < steps; i++) {
            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, stepDelta, UIntPtr.Zero);
            Thread.Sleep(20);
        }

        byte scrollKey = isUp ? VK_PRIOR : VK_NEXT;
        keybd_event(scrollKey, 0, 0, UIntPtr.Zero);
        Thread.Sleep(30);
        keybd_event(scrollKey, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

        Console.WriteLine("SUCCESS: Scrolled " + (isUp ? "up" : "down") + " (" + wheelDelta + ")");
    }

    public static void SendPlayPause() {
        keybd_event(VK_MEDIA_PLAY_PAUSE, 0x22, KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero);
        Thread.Sleep(30);
        keybd_event(VK_MEDIA_PLAY_PAUSE, 0x22, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void SendCtrlW() {
        keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
        keybd_event(VK_W, 0, 0, UIntPtr.Zero);
        Thread.Sleep(30);
        keybd_event(VK_W, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void ExecuteAction(string line) {
        line = (line ?? "").Trim();
        if (string.IsNullOrEmpty(line)) return;

        string action = line;
        string param = "";
        int spaceIdx = line.IndexOf(' ');
        if (spaceIdx > 0) {
            action = line.Substring(0, spaceIdx).Trim().ToLower();
            param = line.Substring(spaceIdx + 1).Trim();
        } else {
            action = line.ToLower();
        }

        if (action == "scroll" || action == "mouse-scroll" || action == "scroll-down" || action == "scroll-up") {
            string dir = "down";
            int amt = -480;
            if (action == "scroll-up" || param == "up" || param.StartsWith("up")) {
                dir = "up";
                amt = 480;
            } else {
                int parsedAmt;
                if (int.TryParse(param, out parsedAmt)) {
                    if (parsedAmt > 0) {
                        dir = "up";
                        amt = parsedAmt;
                    } else {
                        dir = "down";
                        amt = parsedAmt;
                    }
                }
            }
            ScrollActivePage(amt, dir);
        } else if (action == "navigate" || action == "youtube-navigate" || action == "same-page") {
            NavigateCurrentTab(param);
        } else if (action == "pause" || action == "playpause" || action == "youtube-pause") {
            SendPlayPause();
            Console.WriteLine("SUCCESS: Paused/Resumed playback");
        } else if (action == "stop" || action == "youtube-stop" || action == "close-tab" || action == "page-off") {
            SendPlayPause();
            string title;
            IntPtr win = FindBrowserWindow(out title);
            if (win != IntPtr.Zero) {
                AttachAndFocus(win);
                Thread.Sleep(80);
                SendCtrlW();
                Console.WriteLine("SUCCESS: Closed tab in window: " + title);
            } else {
                Console.WriteLine("SUCCESS: Paused media (no YouTube window found to close)");
            }
        } else if (action == "next" || action == "youtube-next") {
            if (!string.IsNullOrEmpty(param) && (param.StartsWith("http://") || param.StartsWith("https://"))) {
                NavigateCurrentTab(param);
            } else {
                string title;
                IntPtr win = FindBrowserWindow(out title);
                if (win != IntPtr.Zero) {
                    AttachAndFocus(win);
                    Thread.Sleep(80);
                    // Send Shift + N (YouTube built-in Next video shortcut)
                    keybd_event(0x10, 0, 0, UIntPtr.Zero); // Shift down
                    Thread.Sleep(25);
                    keybd_event(0x4E, 0, 0, UIntPtr.Zero); // 'N' down
                    Thread.Sleep(35);
                    keybd_event(0x4E, 0, 2, UIntPtr.Zero); // 'N' up
                    keybd_event(0x10, 0, 2, UIntPtr.Zero); // Shift up
                    Thread.Sleep(50);
                    // Also send hardware media next track key
                    keybd_event(VK_MEDIA_NEXT_TRACK, 0x19, KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero);
                    Thread.Sleep(30);
                    keybd_event(VK_MEDIA_NEXT_TRACK, 0x19, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, UIntPtr.Zero);
                    Console.WriteLine("SUCCESS: Sent Shift+N next video to window: " + title);
                } else {
                    keybd_event(VK_MEDIA_NEXT_TRACK, 0x19, KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero);
                    Thread.Sleep(30);
                    keybd_event(VK_MEDIA_NEXT_TRACK, 0x19, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, UIntPtr.Zero);
                    Console.WriteLine("SUCCESS: Next track (no YouTube window found)");
                }
            }
        } else if (action == "prev") {
            keybd_event(VK_MEDIA_PREV_TRACK, 0x10, KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero);
            Thread.Sleep(30);
            keybd_event(VK_MEDIA_PREV_TRACK, 0x10, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, UIntPtr.Zero);
            Console.WriteLine("SUCCESS: Prev track");
        } else if (action == "mute") {
            keybd_event(VK_VOLUME_MUTE, 0, 0, UIntPtr.Zero);
            Thread.Sleep(30);
            keybd_event(VK_VOLUME_MUTE, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Console.WriteLine("SUCCESS: Muted");
        } else if (action == "ping") {
            Console.WriteLine("PONG");
        } else {
            Console.WriteLine("UNKNOWN_ACTION: " + action);
        }
    }

    [STAThread]
    public static void Main(string[] args) {
        if (args.Length > 0 && args[0] == "--daemon") {
            Console.WriteLine("READY");
            string line;
            while ((line = Console.ReadLine()) != null) {
                line = line.Trim();
                if (line == "exit" || line == "quit") break;
                if (!string.IsNullOrEmpty(line)) {
                    ExecuteAction(line);
                }
            }
        } else if (args.Length > 0) {
            ExecuteAction(string.Join(" ", args));
        } else {
            Console.WriteLine("Usage: ZoyaFastControl.exe <action|--daemon>");
        }
    }
}
