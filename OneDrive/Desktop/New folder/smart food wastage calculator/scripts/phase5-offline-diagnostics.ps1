[CmdletBinding()]
param(
    [string]$FrontendUrl = "http://127.0.0.1:4173",
    [string]$BackendUrl = "http://127.0.0.1:8002",
    [ValidateSet("Offline", "Online", "Any")]
    [string]$InternetExpectation = "Offline",
    [string]$InternetProbeAddress = "1.1.1.1",
    [int]$InternetProbePort = 443,
    [switch]$RunInference
)

$ErrorActionPreference = "Stop"
$results = [System.Collections.Generic.List[object]]::new()

function Add-Result {
    param(
        [string]$Name,
        [ValidateSet("PASS", "FAIL", "NOT TESTED")]
        [string]$Status,
        [string]$Evidence
    )

    $results.Add([pscustomobject]@{
        Test = $Name
        Status = $Status
        Evidence = $Evidence
    })
    $color = switch ($Status) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        default { "Yellow" }
    }
    Write-Host ("[{0}] {1}: {2}" -f $Status, $Name, $Evidence) -ForegroundColor $color
}

function Test-TcpConnection {
    param(
        [string]$ComputerName,
        [int]$Port,
        [int]$TimeoutMilliseconds = 3000
    )

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $asyncResult = $client.BeginConnect($ComputerName, $Port, $null, $null)
        if (-not $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMilliseconds)) {
            return $false
        }
        $client.EndConnect($asyncResult)
        return $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Test-HttpEndpoint {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 8
        return [pscustomobject]@{
            Ok = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
            StatusCode = [int]$response.StatusCode
            Content = [string]$response.Content
            Error = ""
        }
    }
    catch {
        $statusCode = $null
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        return [pscustomobject]@{
            Ok = $false
            StatusCode = $statusCode
            Content = ""
            Error = $_.Exception.Message
        }
    }
}

Write-Host "FoodWise Phase 5 offline diagnostics"
Write-Host ("Frontend: {0} | Backend: {1} | Internet expectation: {2}" -f $FrontendUrl, $BackendUrl, $InternetExpectation)
Write-Host "Inference smoke tests write prediction/optimization history; use an isolated FOODWISE_DATA_DIR."

$internetReachable = Test-TcpConnection -ComputerName $InternetProbeAddress -Port $InternetProbePort
switch ($InternetExpectation) {
    "Offline" {
        if ($internetReachable) {
            Add-Result "Internet unavailable" "FAIL" ("External TCP probe {0}:{1} succeeded; disconnect the internet and rerun." -f $InternetProbeAddress, $InternetProbePort)
        }
        else {
            Add-Result "Internet unavailable" "PASS" ("External TCP probe {0}:{1} did not connect." -f $InternetProbeAddress, $InternetProbePort)
        }
    }
    "Online" {
        if ($internetReachable) {
            Add-Result "Internet connectivity" "PASS" ("External TCP probe {0}:{1} connected." -f $InternetProbeAddress, $InternetProbePort)
        }
        else {
            Add-Result "Internet connectivity" "FAIL" ("External TCP probe {0}:{1} did not connect." -f $InternetProbeAddress, $InternetProbePort)
        }
    }
    "Any" {
        $state = if ($internetReachable) { "reachable" } else { "unreachable" }
        Add-Result "Internet connectivity" "PASS" ("External TCP probe {0}:{1} is {2}; informational mode." -f $InternetProbeAddress, $InternetProbePort, $state)
    }
}

$frontendAssets = @(
    @{ Name = "PWA manifest"; Path = "/manifest.webmanifest" },
    @{ Name = "Service worker script"; Path = "/sw.js" },
    @{ Name = "Offline fallback"; Path = "/offline.html" }
)
foreach ($asset in $frontendAssets) {
    $check = Test-HttpEndpoint -Url ($FrontendUrl.TrimEnd("/") + $asset.Path)
    if ($check.Ok) {
        Add-Result $asset.Name "PASS" ("HTTP {0} from {1}" -f $check.StatusCode, $asset.Path)
    }
    else {
        Add-Result $asset.Name "FAIL" ("{0} {1}" -f $asset.Path, $check.Error)
    }
}
Add-Result "Browser service worker and Cache Storage" "NOT TESTED" "Verify registration, active controller, versioned cache entries, and absence of /api responses in DevTools Application."

$backendHealth = $null
try {
    $backendHealth = Invoke-RestMethod -Uri ($BackendUrl.TrimEnd("/") + "/health/local") -TimeoutSec 8
    Add-Result "Local FastAPI backend" "PASS" ("/health/local returned status={0}." -f $backendHealth.status)
}
catch {
    Add-Result "Local FastAPI backend" "FAIL" ("Cannot reach {0}/health/local: {1}" -f $BackendUrl, $_.Exception.Message)
}

$proxyCheck = Test-HttpEndpoint -Url ($FrontendUrl.TrimEnd("/") + "/api/health/local")
if ($proxyCheck.Ok) {
    Add-Result "Frontend-to-backend API proxy" "PASS" ("{0}/api/health/local returned HTTP {1}." -f $FrontendUrl, $proxyCheck.StatusCode)
}
else {
    Add-Result "Frontend-to-backend API proxy" "FAIL" ("Local backend may be reachable directly while the frontend proxy is not: {0}" -f $proxyCheck.Error)
}

if ($null -ne $backendHealth) {
    if ($backendHealth.database_available -and (Test-Path -LiteralPath $backendHealth.database_path -PathType Leaf)) {
        Add-Result "SQLite availability" "PASS" ("Database is reachable at {0}." -f $backendHealth.database_path)
    }
    else {
        Add-Result "SQLite availability" "FAIL" ("database_available={0}; path={1}." -f $backendHealth.database_available, $backendHealth.database_path)
    }

    if ($backendHealth.prediction_model_loaded -and $backendHealth.optimization_model_available) {
        Add-Result "Local model artifacts" "PASS" "Health endpoint reports prediction and optimization model files present."
    }
    else {
        Add-Result "Local model artifacts" "FAIL" ("prediction_model_loaded={0}; optimization_model_available={1}." -f $backendHealth.prediction_model_loaded, $backendHealth.optimization_model_available)
    }

    if ($RunInference) {
        $predictionBody = @{
            meal_category = "Lunch"
            residents_present = 120
            student_turnout = 90
            hostel_capacity = 300
            day_of_week = 2
            month = 10
            is_weekend = 0
        } | ConvertTo-Json -Compress

        try {
            $prediction = Invoke-RestMethod -Method Post -Uri ($BackendUrl.TrimEnd("/") + "/predict") -ContentType "application/json" -Body $predictionBody -TimeoutSec 30
            Add-Result "Prediction inference" "PASS" ("/predict returned {0} kg." -f $prediction.predicted_waste_kg)
        }
        catch {
            Add-Result "Prediction inference / model load" "FAIL" ("/predict failed: {0}" -f $_.Exception.Message)
        }

        $optimizationBody = @{
            meal_category = "Lunch"
            student_turnout = 90
            residents_present = 120
            hostel_capacity = 300
            advance_bookings = 85
            menu_popularity_score = 0.8
            expected_demand_kg = 50.0
            day_of_week = 2
            month = 10
            weekend_flag = 0
            exam_flag = 0
            vacation_flag = 0
            festival_flag = 0
            special_event_flag = 0
            temperature_c = 25.0
            rain_index = 0.0
            waste_cost_per_kg = 20.0
            shortage_cost_per_kg = 100.0
        } | ConvertTo-Json -Compress

        try {
            $optimization = Invoke-RestMethod -Method Post -Uri ($BackendUrl.TrimEnd("/") + "/optimize") -ContentType "application/json" -Body $optimizationBody -TimeoutSec 30
            Add-Result "Preparation optimization inference" "PASS" ("/optimize returned a recommendation of {0} kg." -f $optimization.recommended_preparation_kg)
        }
        catch {
            Add-Result "Preparation optimization / model load" "FAIL" ("/optimize failed: {0}" -f $_.Exception.Message)
        }
    }
    else {
        Add-Result "Prediction inference" "NOT TESTED" "Rerun with -RunInference; this creates a prediction history row."
        Add-Result "Preparation optimization inference" "NOT TESTED" "Rerun with -RunInference; this creates an optimization history row."
    }
}
else {
    Add-Result "SQLite availability" "NOT TESTED" "Backend health endpoint was unreachable."
    Add-Result "Local model artifacts" "NOT TESTED" "Backend health endpoint was unreachable."
    Add-Result "Prediction inference" "NOT TESTED" "Backend health endpoint was unreachable."
    Add-Result "Preparation optimization inference" "NOT TESTED" "Backend health endpoint was unreachable."
}

Write-Host ""
$results | Format-Table -AutoSize
$failures = @($results | Where-Object Status -eq "FAIL").Count
$notTested = @($results | Where-Object Status -eq "NOT TESTED").Count
if ($failures -gt 0) {
    exit 1
}
if ($notTested -gt 0) {
    exit 2
}
exit 0
