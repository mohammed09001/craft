# Memory of a process and everything it started, for the viewport comparison (docs/native-migration/VIEWPORT_COMPARISON.md).
#
#   process-memory.ps1 -RootPid 1234         the process and everything it started
#   process-memory.ps1 -Pids 12,34,56        exactly these processes
# Prints one JSON object on stdout.
#
# Per process: working set and private bytes (what the OS charges the process), and the GPU memory Windows attributes to it
# (the "GPU Process Memory" counters: Local = the adapter's own memory, Shared = system memory the adapter uses; on an
# integrated adapter the latter is where textures and buffers live). Totals add up the whole tree: for Chrome that is the
# browser, the GPU process and the renderer, for the native application it is the one process (and the worker, if one runs).
param([int]$RootPid = 0, [string]$Pids = '')

$ErrorActionPreference = 'Stop'
$all = Get-CimInstance Win32_Process
$tree = [System.Collections.Generic.List[object]]::new()
$queue = [System.Collections.Generic.Queue[int]]::new()
if ($RootPid -gt 0) { $queue.Enqueue($RootPid) }
foreach ($id in ($Pids -split ',' | Where-Object { $_ })) { $queue.Enqueue([int]$id) }
$seen = @{}
while ($queue.Count -gt 0) {
  $id = $queue.Dequeue()
  if ($seen.ContainsKey($id)) { continue }
  $seen[$id] = $true
  $p = $all | Where-Object { $_.ProcessId -eq $id } | Select-Object -First 1
  if ($p) { $tree.Add($p) }
  if ($RootPid -gt 0) { $all | Where-Object { $_.ParentProcessId -eq $id } | ForEach-Object { $queue.Enqueue([int]$_.ProcessId) } }
}

$gpu = @{}
try {
  $samples = (Get-Counter '\GPU Process Memory(*)\Local Usage', '\GPU Process Memory(*)\Shared Usage' -ErrorAction Stop).CounterSamples
  foreach ($s in $samples) {
    if ($s.Path -notmatch 'pid_(\d+)_') { continue }
    $procId = [int]$Matches[1]
    if (-not $gpu.ContainsKey($procId)) { $gpu[$procId] = @{ local = 0.0; shared = 0.0 } }
    if ($s.Path -match 'local usage') { $gpu[$procId].local += $s.CookedValue } else { $gpu[$procId].shared += $s.CookedValue }
  }
} catch { }

$rows = foreach ($p in $tree) {
  $type = 'main'
  if ($p.CommandLine -match '--type=([a-z\-]+)') { $type = $Matches[1] }
  $g = $gpu[[int]$p.ProcessId]
  [pscustomobject]@{
    pid           = [int]$p.ProcessId
    name          = $p.Name
    type          = $type
    workingSetMiB = [math]::Round($p.WorkingSetSize / 1MB, 1)
    privateMiB    = [math]::Round($p.PrivatePageCount / 1MB, 1)
    gpuLocalMiB   = if ($g) { [math]::Round($g.local / 1MB, 1) } else { 0 }
    gpuSharedMiB  = if ($g) { [math]::Round($g.shared / 1MB, 1) } else { 0 }
  }
}
$rows = @($rows)
[pscustomobject]@{
  rootPid = $RootPid
  processes = $rows
  totalWorkingSetMiB = [math]::Round(($rows | Measure-Object workingSetMiB -Sum).Sum, 1)
  totalPrivateMiB = [math]::Round(($rows | Measure-Object privateMiB -Sum).Sum, 1)
  totalGpuLocalMiB = [math]::Round(($rows | Measure-Object gpuLocalMiB -Sum).Sum, 1)
  totalGpuSharedMiB = [math]::Round(($rows | Measure-Object gpuSharedMiB -Sum).Sum, 1)
} | ConvertTo-Json -Depth 5 -Compress
