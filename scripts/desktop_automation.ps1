param(
    [string]$Action,
    [string]$Text = "",
    [string]$Key = "",
    [int]$X = 0,
    [int]$Y = 0,
    [string]$Button = "left",
    [int]$Amount = 0,
    [string]$WindowTitle = "",
    [string]$Command = "",
    [int]$Index = 1,
    [string]$AppName = "",
    [string]$Path = "",
    [string]$Content = "",
    [int]$Level = 50
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$dllPath = Join-Path $PSScriptRoot "WinAutomate.dll"
if (Test-Path $dllPath) {
    Add-Type -Path $dllPath
}

# Mouse Constants
$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
$MOUSEEVENTF_RIGHTDOWN = 0x0008
$MOUSEEVENTF_RIGHTUP = 0x0010
$MOUSEEVENTF_WHEEL = 0x0800

# Virtual-Key codes
$VK_VOLUME_MUTE = 0xAD
$VK_VOLUME_DOWN = 0xAE
$VK_VOLUME_UP = 0xAF
$VK_MEDIA_NEXT_TRACK = 0xB0
$VK_MEDIA_PREV_TRACK = 0xB1
$VK_MEDIA_PLAY_PAUSE = 0xB3
$KEYEVENTF_EXTENDEDKEY = 0x0001
$KEYEVENTF_KEYUP = 0x0002

$wshell = New-Object -ComObject WScript.Shell

function Set-TargetWindow([string]$titlePattern) {
    $script:foundHwnd = [IntPtr]::Zero
    $script:foundTitle = ""

    if ($titlePattern -match "YouTube") {
        $script:foundHwnd = [WinAutomate]::FindBrowserWindow([ref]$script:foundTitle)
    }
    else {
        $script:foundHwnd = [WinAutomate]::FindDesktopWindow($titlePattern, [ref]$script:foundTitle)
    }

    if ($script:foundHwnd -ne [IntPtr]::Zero) {
        if ($script:foundTitle -and ($script:foundTitle -like "*Zoya*" -or $script:foundTitle -like "*Antigravity*" -or $script:foundTitle -like "*Visual Studio*" -or $script:foundTitle -like "*Cursor*")) {
            return $false
        }
        [void][WinAutomate]::AttachAndFocus($script:foundHwnd)
        Start-Sleep -Milliseconds 250
        return $true
    }
    return $false
}
Set-Alias Focus-TargetWindow Set-TargetWindow

    
function Resolve-StandardPath([string]$folderKey) {
    $userHome = [System.Environment]::GetFolderPath('UserProfile')
    $key = $folderKey.ToLower().Trim()
    
    if ($key -eq "desktop") {
        $odDesktop = Join-Path $userHome "OneDrive\Desktop"
        if (Test-Path $odDesktop) { return $odDesktop }
        $odPersonalDesktop = Join-Path $userHome "OneDrive - Personal\Desktop"
        if (Test-Path $odPersonalDesktop) { return $odPersonalDesktop }
        return Join-Path $userHome "Desktop"
    }
    if ($key -eq "downloads" -or $key -eq "download") {
        return Join-Path $userHome "Downloads"
    }
    if ($key -eq "documents" -or $key -eq "document") {
        $odDocs = Join-Path $userHome "OneDrive\Documents"
        if (Test-Path $odDocs) { return $odDocs }
        return Join-Path $userHome "Documents"
    }
    if ($key -eq "pictures" -or $key -eq "photos" -or $key -eq "picture") {
        $odPics = Join-Path $userHome "OneDrive\Pictures"
        if (Test-Path $odPics) { return $odPics }
        return Join-Path $userHome "Pictures"
    }
    if ($key -eq "videos" -or $key -eq "video") {
        return Join-Path $userHome "Videos"
    }
    if (Test-Path $folderKey) {
        return $folderKey
    }
    $desktop = Resolve-StandardPath "desktop"
    $dtPath = Join-Path $desktop $folderKey
    if (Test-Path $dtPath) { return $dtPath }

    $dlPath = Join-Path (Resolve-StandardPath "downloads") $folderKey
    if (Test-Path $dlPath) { return $dlPath }

    $docPath = Join-Path (Resolve-StandardPath "documents") $folderKey
    if (Test-Path $docPath) { return $docPath }

    return $dtPath
}

switch ($Action.ToLower()) {
    "typetext" {
        if ($WindowTitle) {
            Focus-TargetWindow $WindowTitle | Out-Null
        }
        if ($Text) {
            [System.Windows.Forms.Clipboard]::SetText($Text)
            Start-Sleep -Milliseconds 60
            $wshell.SendKeys("^v")
        }
        Write-Output "Typed text successfully"
    }

    "presskey" {
        if ($WindowTitle) {
            Focus-TargetWindow $WindowTitle | Out-Null
            Start-Sleep -Milliseconds 60
        }
        $rawKey = $Key.Trim()
        $kLower = $rawKey.ToLower()

        # Handle Windows Key shortcuts directly with Win32 keybd_event
        $VK_LWIN = 0x5B
        $VK_SHIFT = 0x10
        $VK_CONTROL = 0x11
        $VK_ALT = 0x12

        if ($kLower -eq "win" -or $kLower -eq "windows" -or $kLower -eq "start") {
            [WinAutomate]::keybd_event($VK_LWIN, 0, 0, [UIntPtr]::Zero)
            Start-Sleep -Milliseconds 50
            [WinAutomate]::keybd_event($VK_LWIN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            Write-Output "Key pressed: Windows Key"
            return
        }

        if ($kLower -eq "win+d" -or $kLower -eq "desktop") {
            $shell = New-Object -ComObject Shell.Application
            $shell.ToggleDesktop()
            Write-Output "Key pressed: Win+D (Show Desktop)"
            return
        }

        if ($kLower -eq "win+l" -or $kLower -eq "lock") {
            rundll32.exe user32.dll,LockWorkStation
            Write-Output "Key pressed: Win+L (Lock Workstation)"
            return
        }

        if ($kLower -eq "win+r") {
            [WinAutomate]::keybd_event($VK_LWIN, 0, 0, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event(0x52, 0, 0, [UIntPtr]::Zero) # R
            Start-Sleep -Milliseconds 50
            [WinAutomate]::keybd_event(0x52, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event($VK_LWIN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            Write-Output "Key pressed: Win+R (Run Dialog)"
            return
        }

        if ($kLower -eq "win+e") {
            [WinAutomate]::keybd_event($VK_LWIN, 0, 0, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event(0x45, 0, 0, [UIntPtr]::Zero) # E
            Start-Sleep -Milliseconds 50
            [WinAutomate]::keybd_event(0x45, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event($VK_LWIN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            Write-Output "Key pressed: Win+E (File Explorer)"
            return
        }

        if ($kLower -eq "win+s" -or $kLower -eq "win+q") {
            [WinAutomate]::keybd_event($VK_LWIN, 0, 0, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event(0x53, 0, 0, [UIntPtr]::Zero) # S
            Start-Sleep -Milliseconds 50
            [WinAutomate]::keybd_event(0x53, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event($VK_LWIN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            Write-Output "Key pressed: Win+S (Windows Search)"
            return
        }

        if ($kLower -eq "win+v") {
            [WinAutomate]::keybd_event($VK_LWIN, 0, 0, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event(0x56, 0, 0, [UIntPtr]::Zero) # V
            Start-Sleep -Milliseconds 50
            [WinAutomate]::keybd_event(0x56, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event($VK_LWIN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            Write-Output "Key pressed: Win+V (Clipboard History)"
            return
        }

        if ($kLower -eq "win+x") {
            [WinAutomate]::keybd_event($VK_LWIN, 0, 0, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event(0x58, 0, 0, [UIntPtr]::Zero) # X
            Start-Sleep -Milliseconds 50
            [WinAutomate]::keybd_event(0x58, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event($VK_LWIN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            Write-Output "Key pressed: Win+X (Quick Link Menu)"
            return
        }

        if ($kLower -eq "win+tab") {
            [WinAutomate]::keybd_event($VK_LWIN, 0, 0, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event(0x09, 0, 0, [UIntPtr]::Zero) # Tab
            Start-Sleep -Milliseconds 50
            [WinAutomate]::keybd_event(0x09, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event($VK_LWIN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            Write-Output "Key pressed: Win+Tab (Task View)"
            return
        }

        if ($kLower -eq "win+shift+s" -or $kLower -eq "snipping") {
            [WinAutomate]::keybd_event($VK_LWIN, 0, 0, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event($VK_SHIFT, 0, 0, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event(0x53, 0, 0, [UIntPtr]::Zero) # S
            Start-Sleep -Milliseconds 50
            [WinAutomate]::keybd_event(0x53, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event($VK_SHIFT, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event($VK_LWIN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            Write-Output "Key pressed: Win+Shift+S (Snipping Tool)"
            return
        }

        if ($kLower -eq "prtsc" -or $kLower -eq "printscreen" -or $kLower -eq "snapshot") {
            [WinAutomate]::keybd_event(0x2C, 0, 0, [UIntPtr]::Zero)
            Start-Sleep -Milliseconds 50
            [WinAutomate]::keybd_event(0x2C, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
            Write-Output "Key pressed: PrintScreen"
            return
        }

        if ($kLower -eq "ctrl+shift+esc" -or $kLower -eq "taskmgr" -or $kLower -eq "taskmanager") {
            Start-Process taskmgr.exe
            Write-Output "Launched Task Manager"
            return
        }

        # Universal SendKeys Mapping
        $specialMap = @{
            "enter" = "{ENTER}"; "return" = "{ENTER}"
            "tab" = "{TAB}"
            "esc" = "{ESC}"; "escape" = "{ESC}"
            "space" = " "; "spacebar" = " "
            "backspace" = "{BACKSPACE}"; "back" = "{BACKSPACE}"
            "del" = "{DELETE}"; "delete" = "{DELETE}"
            "insert" = "{INSERT}"; "ins" = "{INSERT}"
            "home" = "{HOME}"
            "end" = "{END}"
            "pageup" = "{PGUP}"; "pgup" = "{PGUP}"
            "pagedown" = "{PGDN}"; "pgdn" = "{PGDN}"
            "up" = "{UP}"; "arrowup" = "{UP}"
            "down" = "{DOWN}"; "arrowdown" = "{DOWN}"
            "left" = "{LEFT}"; "arrowleft" = "{LEFT}"
            "right" = "{RIGHT}"; "arrowright" = "{RIGHT}"
            "capslock" = "{CAPSLOCK}"
            "numlock" = "{NUMLOCK}"
            "scrolllock" = "{SCROLLLOCK}"
            "f1" = "{F1}"; "f2" = "{F2}"; "f3" = "{F3}"; "f4" = "{F4}"
            "f5" = "{F5}"; "f6" = "{F6}"; "f7" = "{F7}"; "f8" = "{F8}"
            "f9" = "{F9}"; "f10" = "{F10}"; "f11" = "{F11}"; "f12" = "{F12}"
            "slash" = "/"; "backslash" = "\"
        }

        # Check direct single key match in special map
        if ($specialMap.ContainsKey($kLower)) {
            $wshell.SendKeys($specialMap[$kLower])
            Write-Output "Key pressed: $Key"
            return
        }

        # Parse key combinations (e.g. "ctrl+shift+t", "alt+f4", "ctrl+a")
        if ($kLower -match "\+") {
            $parts = $kLower -split "\+"
            $prefix = ""
            $baseKey = ""

            foreach ($p in $parts) {
                $trimmed = $p.Trim()
                if ($trimmed -eq "ctrl" -or $trimmed -eq "control") {
                    $prefix += "^"
                } elseif ($trimmed -eq "alt") {
                    $prefix += "%"
                } elseif ($trimmed -eq "shift") {
                    $prefix += "+"
                } elseif ($trimmed -eq "win" -or $trimmed -eq "windows") {
                    # For win+letter
                    $char = $parts[-1].Trim().ToUpper()
                    if ($char.Length -eq 1) {
                        $ascii = [byte][char]$char
                        [WinAutomate]::keybd_event($VK_LWIN, 0, 0, [UIntPtr]::Zero)
                        [WinAutomate]::keybd_event($ascii, 0, 0, [UIntPtr]::Zero)
                        Start-Sleep -Milliseconds 50
                        [WinAutomate]::keybd_event($ascii, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
                        [WinAutomate]::keybd_event($VK_LWIN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
                        Write-Output "Key pressed: $Key"
                        return
                    }
                } else {
                    $baseKey = $trimmed
                }
            }

            if ($baseKey) {
                $mappedBase = if ($specialMap.ContainsKey($baseKey)) { $specialMap[$baseKey] } else { $baseKey }
                $sendString = "$prefix$mappedBase"
                try {
                    $wshell.SendKeys($sendString)
                    Write-Output "Key combination pressed: $Key -> $sendString"
                    return
                } catch {
                    [System.Windows.Forms.SendKeys]::SendWait($sendString)
                    Write-Output "Key combination pressed via Forms: $Key"
                    return
                }
            }
        }

        # Fallback to direct SendKeys
        try {
            $wshell.SendKeys($rawKey)
        } catch {
            [System.Windows.Forms.SendKeys]::SendWait($rawKey)
        }
        Write-Output "Key pressed: $Key"
    }

    "click" {
        if ($WindowTitle) {
            Focus-TargetWindow $WindowTitle | Out-Null
        }
        if ($X -gt 0 -and $Y -gt 0) {
            [void][WinAutomate]::SetCursorPos($X, $Y)
            Start-Sleep -Milliseconds 60
        }
        
        switch ($Button.ToLower()) {
            "right" {
                [WinAutomate]::mouse_event($MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, [UIntPtr]::Zero)
                [WinAutomate]::mouse_event($MOUSEEVENTF_RIGHTUP, 0, 0, 0, [UIntPtr]::Zero)
            }
            "double" {
                [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
                [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
                Start-Sleep -Milliseconds 80
                [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
                [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
            }
            default {
                [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
                [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
            }
        }
        Write-Output "Clicked $Button at ($X, $Y)"
    }

    "scroll" {
        if ($WindowTitle) {
            Set-TargetWindow $WindowTitle | Out-Null
            Start-Sleep -Milliseconds 100
        }
        $scrollAmt = if ($Amount -ne 0) { $Amount } else { -400 }

        # Smooth mouse wheel scrolling
        $steps = 4
        $stepVal = [int]($scrollAmt / $steps)
        for ($i = 0; $i -lt $steps; $i++) {
            [WinAutomate]::mouse_event($MOUSEEVENTF_WHEEL, 0, 0, $stepVal, [UIntPtr]::Zero)
            Start-Sleep -Milliseconds 25
        }

        # Keyboard page scroll complement to ensure browser scrolls
        if ($scrollAmt -lt 0) {
            $wshell.SendKeys("{PGDN}")
        }
        else {
            $wshell.SendKeys("{PGUP}")
        }

        Write-Output "Scrolled $scrollAmt successfully"
    }

    "youtube-search" {
        if ($Text) {
            $encoded = [System.Uri]::EscapeDataString($Text)
            $searchUrl = "https://www.youtube.com/results?search_query=$encoded"
            Start-Process $searchUrl

            # Save state so youtube-click knows a search page is active
            $stateFile = Join-Path $env:TEMP "zoya_last_yt_query.txt"
            Set-Content -Path $stateFile -Value "$Text|$((Get-Date).Ticks)" -Force

            Write-Output "Searched YouTube for: $Text"
        }
    }

    "youtube-click" {
        $itemIdx = if ($Index -gt 0) { $Index } else { 1 }

        # 0a. Check if direct video ID or URL was provided in $Text
        if ($Text -and ($Text -match "^[a-zA-Z0-9_-]{11}$" -or $Text -like "http*")) {
            $directUrl = if ($Text -like "http*") {
                if ($Text -notlike "*autoplay=1*") { if ($Text -like "*?*") { "$Text&autoplay=1" } else { "$Text?autoplay=1" } } else { $Text }
            } else {
                "https://www.youtube.com/watch?v=$Text&autoplay=1"
            }
            Start-Process $directUrl
            Start-Sleep -Milliseconds 500
            Set-TargetWindow "YouTube|Chrome|Edge|Firefox|Brave|Opera" | Out-Null
            Write-Output "Launched direct YouTube video for item #${itemIdx} - $directUrl"
            return
        }

        # 0b. Check cached video IDs from temp search cache file
        $cacheFile = Join-Path $env:TEMP "zoya_yt_search_ids.json"
        if (Test-Path $cacheFile) {
            try {
                $cacheContent = Get-Content -Path $cacheFile -Raw | ConvertFrom-Json
                $idx = $itemIdx - 1
                if ($cacheContent.videoIds -and $idx -ge 0 -and $idx -lt $cacheContent.videoIds.Length) {
                    $vId = $cacheContent.videoIds[$idx]
                    if ($vId) {
                        $directUrl = "https://www.youtube.com/watch?v=$vId&autoplay=1"
                        Start-Process $directUrl
                        Start-Sleep -Milliseconds 500
                        Set-TargetWindow "YouTube|Chrome|Edge|Firefox|Brave|Opera" | Out-Null
                        Write-Output "Launched YouTube video from cache for item #${itemIdx} - $directUrl"
                        return
                    }
                }
            }
            catch {}
        }

        # Physical click fallback
        Set-TargetWindow "YouTube|Chrome|Edge|Firefox|Brave|Opera" | Out-Null
        Start-Sleep -Milliseconds 300

        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

        # Check state file or window title to see if active page is YouTube Search Results
        $stateFile = Join-Path $env:TEMP "zoya_last_yt_query.txt"
        $isSearch = $false
        if ($script:foundTitle -and ($script:foundTitle -like "* - YouTube*") -and ($script:foundTitle -notlike "YouTube - *")) {
            $isSearch = $true
        }
        elseif (Test-Path $stateFile) {
            try {
                $raw = Get-Content -Path $stateFile -Raw
                $parts = $raw.Split('|')
                if ($parts.Length -ge 2) {
                    $savedTicks = [int64]$parts[1]
                    $elapsedSeconds = ((Get-Date).Ticks - $savedTicks) / 10000000
                    if ($elapsedSeconds -lt 300) {
                        $isSearch = $true
                    }
                }
            }
            catch {}
        }

        $targetX = 0
        $targetY = 0

        if ($isSearch) {
            # Search Results layout (Vertical video list)
            $targetX = [int]($screen.Width * 0.25)
            if ($targetX -lt 280) { $targetX = 360 }

            $baseY = [int]($screen.Height * 0.30)
            $rowSpacing = [int]($screen.Height * 0.22)
            
            $targetY = $baseY + (($itemIdx - 1) * $rowSpacing)
            if ($targetY -gt ($screen.Height - 100)) {
                $scrollUnits = -450 * [int](($itemIdx - 1) / 3)
                [WinAutomate]::mouse_event($MOUSEEVENTF_WHEEL, 0, 0, $scrollUnits, [UIntPtr]::Zero)
                Start-Sleep -Milliseconds 350
                $targetY = [int]($screen.Height * 0.50)
            }
        }
        else {
            # Home Page layout (Horizontal Grid)
            $colWidth = [int](($screen.Width - 260) / 3)
            $colIdx = ($itemIdx - 1) % 3
            $rowIdx = [int][Math]::Floor(($itemIdx - 1) / 3)

            $targetX = 260 + [int]($colIdx * $colWidth) + [int]($colWidth * 0.45)
            $targetY = 320 + ($rowIdx * 300)

            if ($targetY -gt ($screen.Height - 100)) {
                [WinAutomate]::mouse_event($MOUSEEVENTF_WHEEL, 0, 0, -450, [UIntPtr]::Zero)
                Start-Sleep -Milliseconds 350
                $targetY = 380
            }
        }

        # 1. Click video thumbnail directly
        [void][WinAutomate]::SetCursorPos($targetX, $targetY)
        Start-Sleep -Milliseconds 100
        [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
        [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 60
        [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
        [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)

        # 2. In Search Results, also click title link to guarantee hit
        if ($isSearch) {
            Start-Sleep -Milliseconds 80
            $titleX = $targetX + [int]($screen.Width * 0.16)
            [void][WinAutomate]::SetCursorPos($titleX, $targetY)
            Start-Sleep -Milliseconds 60
            [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
            [WinAutomate]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
        }

        Write-Output "Clicked YouTube item #$itemIdx at ($targetX, $targetY) [isSearch=$isSearch, title=$script:foundTitle]"
    }

    "youtube-play-query" {
        $queryText = if ($Text) { $Text } else { "trending music" }
        $itemIdx = if ($Index -gt 0) { $Index } else { 1 }

        # Check if direct cached video ID exists for this index
        $cacheFile = Join-Path $env:TEMP "zoya_yt_search_ids.json"
        if (Test-Path $cacheFile) {
            try {
                $cacheContent = Get-Content -Path $cacheFile -Raw | ConvertFrom-Json
                $idx = $itemIdx - 1
                if ($cacheContent.videoIds -and $idx -ge 0 -and $idx -lt $cacheContent.videoIds.Length) {
                    $vId = $cacheContent.videoIds[$idx]
                    if ($vId) {
                        $directUrl = "https://www.youtube.com/watch?v=$vId&autoplay=1"
                        Start-Process $directUrl
                        Write-Output "Played video #$itemIdx directly: $directUrl"
                        return
                    }
                }
            } catch {}
        }

        # Otherwise open search results page safely without blind clicks
        $encoded = [System.Uri]::EscapeDataString($queryText)
        $searchUrl = "https://www.youtube.com/results?search_query=$encoded"
        Start-Process $searchUrl
        Write-Output "Opened YouTube search for '$queryText'"
    }

    "media" {
        switch ($Key.ToLower()) {
            "volumeup" {
                1..3 | ForEach-Object {
                    [WinAutomate]::keybd_event($VK_VOLUME_UP, 0, 0, [UIntPtr]::Zero)
                    [WinAutomate]::keybd_event($VK_VOLUME_UP, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
                    Start-Sleep -Milliseconds 50
                }
                Write-Output "Volume Up"
            }

            "volumedown" {
                1..3 | ForEach-Object {
                    [WinAutomate]::keybd_event($VK_VOLUME_DOWN, 0, 0, [UIntPtr]::Zero)
                    [WinAutomate]::keybd_event($VK_VOLUME_DOWN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
                    Start-Sleep -Milliseconds 50
                }
                Write-Output "Volume Down"
            }
            "mute" {
                [WinAutomate]::keybd_event($VK_VOLUME_MUTE, 0, 0, [UIntPtr]::Zero)
                [WinAutomate]::keybd_event($VK_VOLUME_MUTE, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
                Write-Output "Volume Muted/Toggled"
            }
            "playpause" {
                [WinAutomate]::keybd_event($VK_MEDIA_PLAY_PAUSE, 0x22, $KEYEVENTF_EXTENDEDKEY, [UIntPtr]::Zero)
                Start-Sleep -Milliseconds 60
                [WinAutomate]::keybd_event($VK_MEDIA_PLAY_PAUSE, 0x22, ($KEYEVENTF_EXTENDEDKEY -bor $KEYEVENTF_KEYUP), [UIntPtr]::Zero)
                Write-Output "Media Play/Pause (VK_MEDIA_PLAY_PAUSE)"
            }
            "next" {
                [WinAutomate]::keybd_event($VK_MEDIA_NEXT_TRACK, 0x19, $KEYEVENTF_EXTENDEDKEY, [UIntPtr]::Zero)
                Start-Sleep -Milliseconds 60
                [WinAutomate]::keybd_event($VK_MEDIA_NEXT_TRACK, 0x19, ($KEYEVENTF_EXTENDEDKEY -bor $KEYEVENTF_KEYUP), [UIntPtr]::Zero)
                Write-Output "Next Track"
            }
            "prev" {
                [WinAutomate]::keybd_event($VK_MEDIA_PREV_TRACK, 0x10, $KEYEVENTF_EXTENDEDKEY, [UIntPtr]::Zero)
                Start-Sleep -Milliseconds 60
                [WinAutomate]::keybd_event($VK_MEDIA_PREV_TRACK, 0x10, ($KEYEVENTF_EXTENDEDKEY -bor $KEYEVENTF_KEYUP), [UIntPtr]::Zero)
                Write-Output "Previous Track"
            }
            default {
                Write-Output "Unknown media key: $Key"
            }
        }
    }

    "youtube-pause" {
        # Hardware Media Play/Pause key works globally across Windows to pause/resume active audio/video without closing tab
        [WinAutomate]::keybd_event($VK_MEDIA_PLAY_PAUSE, 0x22, $KEYEVENTF_EXTENDEDKEY, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 60
        [WinAutomate]::keybd_event($VK_MEDIA_PLAY_PAUSE, 0x22, ($KEYEVENTF_EXTENDEDKEY -bor $KEYEVENTF_KEYUP), [UIntPtr]::Zero)
        Write-Output "Paused/Toggled YouTube playback via hardware media key (VK_MEDIA_PLAY_PAUSE)"
    }

    "youtube-stop" {
        # Instantly mute/pause audio playback first
        [WinAutomate]::keybd_event($VK_MEDIA_PLAY_PAUSE, 0x22, $KEYEVENTF_EXTENDEDKEY, [UIntPtr]::Zero)
        [WinAutomate]::keybd_event($VK_MEDIA_PLAY_PAUSE, 0x22, ($KEYEVENTF_EXTENDEDKEY -bor $KEYEVENTF_KEYUP), [UIntPtr]::Zero)

        $focused = Set-TargetWindow "YouTube"
        if ($focused -and $script:foundTitle -like "*YouTube*" -and $script:foundTitle -notlike "*Zoya*") {
            # Send Ctrl+W to close the YouTube tab completely
            $wshell.SendKeys("^w")
            Write-Output "Successfully turned off and closed tab in '$script:foundTitle'"
        } else {
            Write-Output "Sent hardware media pause (no active YouTube tab found to close)"
        }
    }

    "setvolume" {
        $steps = [int]([Math]::Round([Math]::Max(0, [Math]::Min(100, $Level)) / 2))
        1..50 | ForEach-Object {
            [WinAutomate]::keybd_event($VK_VOLUME_DOWN, 0, 0, [UIntPtr]::Zero)
            [WinAutomate]::keybd_event($VK_VOLUME_DOWN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
        }
        if ($steps -gt 0) {
            1..$steps | ForEach-Object {
                [WinAutomate]::keybd_event($VK_VOLUME_UP, 0, 0, [UIntPtr]::Zero)
                [WinAutomate]::keybd_event($VK_VOLUME_UP, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
                Start-Sleep -Milliseconds 10
            }
        }
        Write-Output "Set volume to approx $Level%"
    }

    "setbrightness" {
        try {
            $bLevel = [Math]::Max(0, [Math]::Min(100, $Level))
            (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods).WmiSetBrightness(1, $bLevel) | Out-Null
            Write-Output "Set brightness to $bLevel%"
        }
        catch {
            Write-Output "Brightness adjustment not supported on this display hardware"
        }
    }

    "focuswindow" {
        $found = Set-TargetWindow $WindowTitle
        if ($found) {
            Write-Output "Focused window matching '$WindowTitle'"
        }
        else {
            Write-Output "Window matching '$WindowTitle' not found"
        }
    }

    "closeapp" {
        if (-not $AppName) {
            Write-Output "AppName is required to close"
            return
        }
        $cleanName = $AppName.ToLower().Replace(".exe", "").Trim()

        # Never terminate host browsers to protect Zoya AI Assistant
        if ($cleanName -match "^(chrome|googlechrome|google-chrome|msedge|edge|firefox|brave|opera|vivaldi|browser)$") {
            Write-Output "Host browser is protected to keep Zoya active and cannot be closed."
            return
        }

        # Special handling for YouTube: Close the YouTube browser tab via Ctrl+W
        if ($cleanName -match "youtube|gaan|music|song") {
            $focused = Set-TargetWindow "YouTube"
            if ($focused -and $script:foundTitle -like "*YouTube*" -and $script:foundTitle -notlike "*Zoya*") {
                Start-Sleep -Milliseconds 150
                $wshell.SendKeys("k")
                Start-Sleep -Milliseconds 100
                $wshell.SendKeys("^w")
                Write-Output "Successfully closed YouTube tab via Ctrl+W"
                return
            } else {
                [WinAutomate]::keybd_event($VK_MEDIA_PLAY_PAUSE, 0x22, $KEYEVENTF_EXTENDEDKEY, [UIntPtr]::Zero)
                [WinAutomate]::keybd_event($VK_MEDIA_PLAY_PAUSE, 0x22, ($KEYEVENTF_EXTENDEDKEY -bor $KEYEVENTF_KEYUP), [UIntPtr]::Zero)
                Write-Output "Sent hardware media pause for YouTube (no separate YouTube window open)"
                return
            }
        }

        # For general apps, find processes (prevent closing Zoya AI Assistant or host browsers)
        $procs = Get-Process | Where-Object { 
            ($_.ProcessName.ToLower() -eq $cleanName -or 
             $_.ProcessName.ToLower() -like "*$cleanName*" -or
             $_.MainWindowTitle.ToLower() -like "*$cleanName*") -and
            $_.MainWindowTitle -notlike "*Zoya*" -and
            $_.MainWindowTitle -notlike "*Antigravity*" -and
            $_.ProcessName.ToLower() -notmatch "^(chrome|msedge|firefox|brave|opera)$"
        }
        if ($procs) {
            foreach ($p in $procs) {
                try {
                    $p.CloseMainWindow() | Out-Null
                    Start-Sleep -Milliseconds 150
                    if (-not $p.HasExited) {
                        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
                    }
                }
                catch {}
            }
            Write-Output "Successfully closed $AppName"
        }
        else {
            Write-Output "No running process found for $AppName"
        }
    }

    "screenshot" {
        $desktop = Resolve-StandardPath "desktop"
        $filename = "screenshot_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".png"
        $filePath = Join-Path $desktop $filename

        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $bitmap.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
        $graphics.Dispose()
        $bitmap.Dispose()

        Write-Output "Screenshot saved to $filePath"
    }

    "systemstatus" {
        $battery = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue
        $batteryPercent = if ($battery) { $battery.EstimatedChargeRemaining } else { "N/A" }
        $charging = if ($battery -and ($battery.BatteryStatus -eq 2 -or $battery.BatteryStatus -eq 6 -or $battery.BatteryStatus -eq 7 -or $battery.BatteryStatus -eq 8)) { "Charging" } else { "On Battery" }
        
        $fgHwnd = [WinAutomate]::GetForegroundWindow()
        $sb = New-Object System.Text.StringBuilder 512
        [WinAutomate]::GetWindowText($fgHwnd, $sb, $sb.Capacity) | Out-Null
        $activeWindow = $sb.ToString().Trim()

        $osInfo = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
        $freeMemMB = if ($osInfo) { [int]($osInfo.FreePhysicalMemory / 1024) } else { 0 }
        $totalMemMB = if ($osInfo) { [int]($osInfo.TotalVisibleMemorySize / 1024) } else { 0 }
        $usedMemMB = $totalMemMB - $freeMemMB

        $statusObj = @{
            battery      = "$batteryPercent%"
            powerStatus  = $charging
            activeWindow = $activeWindow
            ramUsage     = "$usedMemMB MB / $totalMemMB MB"
            localTime    = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
        $statusObj | ConvertTo-Json -Compress | Write-Output
    }

    "clipboard" {
        if ($Key.ToLower() -eq "get") {
            $clip = [System.Windows.Forms.Clipboard]::GetText()
            Write-Output "Clipboard content: $clip"
        }
        else {
            [System.Windows.Forms.Clipboard]::SetText($Text)
            Write-Output "Copied text to clipboard"
        }
    }

    "browsernav" {
        Set-TargetWindow "Chrome|Edge|Firefox|Brave|Opera|Vivaldi|YouTube" | Out-Null
        Start-Sleep -Milliseconds 100
        switch ($Key.ToLower()) {
            "back" { $wshell.SendKeys("%{LEFT}") }
            "forward" { $wshell.SendKeys("%{RIGHT}") }
            "refresh" { $wshell.SendKeys("{F5}") }
            "new_tab" { $wshell.SendKeys("^t") }
            "close_tab" { $wshell.SendKeys("^w") }
            "reopen_tab" { $wshell.SendKeys("^+t") }
            "zoom_in" { $wshell.SendKeys("^{+}") }
            "zoom_out" { $wshell.SendKeys("^-") }
            "zoom_reset" { $wshell.SendKeys("^0") }
            "address_bar" { $wshell.SendKeys("^l") }
            "find" { $wshell.SendKeys("^f") }
            default { $wshell.SendKeys("{F5}") }
        }
        Write-Output "Browser navigation executed: $Key"
    }

    "managefile" {
        $resolvedPath = Resolve-StandardPath $Path
        switch ($Key.ToLower()) {
            "list" {
                if (Test-Path $resolvedPath) {
                    $items = Get-ChildItem -Path $resolvedPath -ErrorAction SilentlyContinue | Select-Object -First 25 -ExpandProperty Name
                    $itemsStr = $items -join ", "
                    Write-Output "Files in $resolvedPath : $itemsStr"
                }
                else {
                    Write-Output "Directory not found: $resolvedPath"
                }
            }
            "create_folder" {
                if (-not (Test-Path $resolvedPath)) {
                    New-Item -ItemType Directory -Path $resolvedPath -Force | Out-Null
                    Write-Output "Created folder at $resolvedPath"
                }
                else {
                    Write-Output "Folder already exists at $resolvedPath"
                }
                Invoke-Item $resolvedPath
            }
            "create_file" {
                Set-Content -Path $resolvedPath -Value $Content -Encoding utf8
                Write-Output "Created file at $resolvedPath"
                Invoke-Item $resolvedPath
            }
            "read_file" {
                if (Test-Path $resolvedPath) {
                    $c = Get-Content -Path $resolvedPath -Raw -ErrorAction SilentlyContinue
                    if ($c.Length -gt 2000) { $c = $c.Substring(0, 2000) + "..." }
                    Write-Output "File content of $resolvedPath : $c"
                }
                else {
                    Write-Output "File not found: $resolvedPath"
                }
            }
            "delete" {
                if (Test-Path $resolvedPath) {
                    Remove-Item -Path $resolvedPath -Recurse -Force -ErrorAction SilentlyContinue
                    Write-Output "Deleted: $resolvedPath"
                }
                else {
                    Write-Output "Path not found to delete: $resolvedPath"
                }
            }
            "open" {
                if (Test-Path $resolvedPath) {
                    Invoke-Item $resolvedPath
                    Write-Output "Opened: $resolvedPath"
                }
                else {
                    Write-Output "Path not found: $resolvedPath"
                }
            }
            default {
                Write-Output "Unknown file operation: $Key"
            }
        }
    }

    "command" {
        if ($Command) {
            Invoke-Expression $Command | Out-String | Write-Output
        }
    }

    default {
        Write-Output "Unknown action: $Action"
    }
}
