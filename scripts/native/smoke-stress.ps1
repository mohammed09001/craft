# Runs the real-event smoke tests (ctest -R app_smoke) many times, optionally under conditions that disturb a test that depends on
# timing or on the window being active, and reports every failure with the test's own message.
# Documented in docs/native-migration/RISKS.md (R-Smoke-1).
#
#   .\scripts\native\smoke-stress.ps1 -Iterations 15                          idle machine
#   .\scripts\native\smoke-stress.ps1 -Iterations 8 -Busy                     every logical CPU kept at 100 %
#   .\scripts\native\smoke-stress.ps1 -Iterations 8 -Dialog                   a topmost modal dialog holding the foreground
#   .\scripts\native\smoke-stress.ps1 -Iterations 8 -Busy -Dialog
#
# The conditions are checked before the first run and the script refuses to go on without them: an earlier version of this
# measurement "ran under load" with burners that had silently failed to start (a command line split at its space) and "ran with a
# dialog" that never appeared, and reported a clean result for conditions that did not exist. Run it from the repository root; it needs
# a Debug build of the tests (cmake --build --preset windows-debug, from native/).
[CmdletBinding()]
param(
  [int]$Iterations = 10,
  [switch]$Busy,
  [switch]$Dialog,
  [string]$Out
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot 'windows-env.ps1') | Out-Null
if (-not $Out) { $Out = Join-Path $env:CRAFT_BUILD_ROOT ("smoke-stress-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt') }
$python = if ($env:CRAFT_PYTHON) { $env:CRAFT_PYTHON } else { 'D:\CraftNative\python\venv\Scripts\python.exe' }

Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public class SmokeWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  public static bool Exists(string title) { bool r = false; EnumWindows((h, l) => { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); if (sb.ToString() == title && IsWindowVisible(h)) r = true; return true; }, IntPtr.Zero); return r; }
  public static void Close(string title) { EnumWindows((h, l) => { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); if (sb.ToString() == title) SendMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero); return true; }, IntPtr.Zero); }
  public static string Foreground() { var sb = new StringBuilder(256); GetWindowText(GetForegroundWindow(), sb, 256); return sb.ToString(); }
}
'@

$burners = @(); $dialogProcess = $null
$dialogScript = Join-Path $env:TEMP 'craft-smoke-dialog.ps1'
Set-Content $dialogScript @'
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object Windows.Forms.Form
$f.TopMost = $true; $f.Text = 'smoke stress form'; $f.StartPosition = 'CenterScreen'; $f.Size = New-Object Drawing.Size(420, 160)
$f.Add_Shown({ $f.Activate() }); $f.Show()
[void][Windows.Forms.MessageBox]::Show($f, 'smoke stress: held open on purpose', 'smoke stress dialog', 'OK', 'Warning')
'@
try {
  if ($Busy) {
    $count = (Get-CimInstance Win32_Processor | Measure-Object NumberOfLogicalProcessors -Sum).Sum
    # the code is passed as ONE argument (quoted): an unquoted argument is split at its space and python exits at once
    $burners = 1..$count | ForEach-Object { Start-Process $python -ArgumentList '-c', '"while True: pass"' -WindowStyle Hidden -PassThru }
    Start-Sleep -Seconds 3
    $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 2 -MaxSamples 1).CounterSamples[0].CookedValue
    $alive = @($burners | Where-Object { -not $_.HasExited }).Count
    if ($alive -lt $count -or $cpu -lt 85) { throw "The CPU load is not there ($alive of $count burners alive, total CPU $([math]::Round($cpu)) %)." }
    "load: $alive burners, total CPU $([math]::Round($cpu)) %"
  }
  if ($Dialog) {
    $dialogProcess = Start-Process powershell.exe -ArgumentList '-NoProfile', '-STA', '-File', $dialogScript -PassThru
    Start-Sleep -Seconds 3
    if (-not [SmokeWin]::Exists('smoke stress dialog')) { throw 'The dialog is not on screen.' }
    "dialog: on screen, foreground window '$([SmokeWin]::Foreground())'"
  }
  Push-Location (Join-Path $repo 'native')
  $failures = @{}; $total = 0; $times = @{}
  "start $(Get-Date -Format s): $Iterations iterations, busy=$Busy dialog=$Dialog" | Tee-Object $Out
  foreach ($i in 1..$Iterations) {
    $text = ctest --preset windows-debug -R app_smoke --output-on-failure 2>&1 | Out-String
    foreach ($m in [regex]::Matches($text, 'Test\s+#\d+: (\S+) \.+\s*(\*\*\*)?(Passed|Failed|Timeout)\s+([\d.]+) sec')) {
      $total++
      $name = $m.Groups[1].Value
      if (-not $times[$name]) { $times[$name] = @() }
      $times[$name] += [double]$m.Groups[4].Value
      if ($m.Groups[3].Value -ne 'Passed') {
        $failures[$name] = 1 + [int]$failures[$name]
        $message = ($text -split "`n" | Select-String 'CRAFT_SMOKE_FAIL' | ForEach-Object { $_.Line.Trim() }) -join ' | '
        "iteration $i FAILED $name ($($m.Groups[4].Value) s): $message" | Tee-Object $Out -Append
      }
    }
  }
  if ($Dialog -and -not [SmokeWin]::Exists('smoke stress dialog')) { "note: the dialog was gone before the end of the run" | Tee-Object $Out -Append }
  "done $(Get-Date -Format s): $total test runs, failures: $(if ($failures.Count) { ($failures.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', ' } else { 'none' })" | Tee-Object $Out -Append
  foreach ($k in $times.Keys | Sort-Object) {
    $s = @($times[$k] | Sort-Object)
    ("{0,-26} median {1:N1} s  max {2:N1} s" -f $k, $s[[int]($s.Count / 2)], $s[-1]) | Tee-Object $Out -Append
  }
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  $burners | ForEach-Object { try { $_.Kill() } catch {} }
  [SmokeWin]::Close('smoke stress dialog'); Start-Sleep -Milliseconds 500; [SmokeWin]::Close('smoke stress form')
  if ($dialogProcess -and -not $dialogProcess.HasExited) { try { $dialogProcess.Kill() } catch {} }
}
