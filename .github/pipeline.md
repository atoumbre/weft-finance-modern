
## Pipeline Overview

### Triggers
- **Push to `main`**: Deploys to mainnet environment
- **Push to `stage`**: Deploys to stokenet environment
- **Manual dispatch**: Choose environment

### Key Features

#### Concurrency Controls
- Top-level: `deploy-${{ github.ref }}` - Queues deployments from same branch
- Per-environment: `mainnet-deployment`, `stokenet-deployment`, `shared-deployment`
- Prevents Terraform state conflicts

#### Infrastructure-Ready Gate
Single gate job that verifies:
- ✅ Shared resources deployed successfully
- ✅ Correct environment (mainnet OR stokenet) deployed successfully
- ⛔ Blocks all service deployments if infrastructure fails

#### Path Filters
Services only build/deploy when their code changes:
- `services/containers/indexer/**`
- `services/containers/liquidator/**`
- `services/functions/dispatcher/**`
- `services/functions/oracle-updater/**`

### Deployment Sequence

1. **Validation** (on PR): Tests + Terraform validate
2. **Environment Selection**: Determine mainnet or stokenet
3. **Infrastructure**:
   - Deploy shared (always)
   - Deploy mainnet (if main branch)
   - Deploy stokenet (if stage branch)
4. **Infrastructure Gate**: Verify all infrastructure succeeded
5. **Service Builds**: Build changed container images
6. **Service Deployments**: Deploy services to correct environment


```mermaid
---
config:
  layout: elk
---
flowchart TB
    Start([Workflow Trigger<br/>main or stage branch]) --> PreCheck{Precheck<br/>Tests & Validation}
    PreCheck -- Pass --> SetEnv[Set Environment<br/>main → mainnet<br/>stage → stokenet]
    PreCheck -- Pass --> Filter[Filter Changed Files<br/>- services/*<br/>- resources/*]
    PreCheck -- Fail --> End([End])
    
    SetEnv --> EnvReady[Environment Determined]
    
    subgraph Infrastructure[Infrastructure Deployment]
        EnvReady --> DeployShared[Deploy Shared<br/>Admin Resources<br/>Budget Alerts]
        EnvReady --> DeployMainnet{Deploy Mainnet?}
        EnvReady --> DeployStokenet{Deploy Stokenet?}
        
        DeployMainnet -- if mainnet --> MainnetDeploy[Deploy Mainnet<br/>Backend + Observability]
        DeployStokenet -- if stokenet --> StokenetDeploy[Deploy Stokenet<br/>Backend + Observability]
        
        DeployShared --> InfraGate{Infrastructure Ready?<br/>Shared + Environment}
        MainnetDeploy --> InfraGate
        StokenetDeploy --> InfraGate
    end
    
    subgraph Builds[Service Builds]
        Filter -- indexer changed --> BuildIndexer[Build Indexer<br/>Container Image]
        Filter -- liquidator changed --> BuildLiquidator[Build Liquidator<br/>Container Image]
        
        BuildIndexer --> IndexerReady{Build Success?}
        BuildLiquidator --> LiquidatorReady{Build Success?}
        
        IndexerReady -- Yes --> IndexerImage[Indexer Image Ready]
        IndexerReady -- No --> IndexerFailed([Build Failed])
        LiquidatorReady -- Yes --> LiquidatorImage[Liquidator Image Ready]
        LiquidatorReady -- No --> LiquidatorFailed([Build Failed])
    end
    
    subgraph Deployments[Service Deployments]
        InfraGate -- Ready --> DeployGate[Services Can Deploy]
        
        IndexerImage --> WaitInfra1{Infra Ready?}
        LiquidatorImage --> WaitInfra2{Infra Ready?}
        Filter -- dispatcher changed --> WaitInfra3{Infra Ready?}
        Filter -- oracle-updater changed --> WaitInfra4{Infra Ready?}
        
        DeployGate --> WaitInfra1
        DeployGate --> WaitInfra2
        DeployGate --> WaitInfra3
        DeployGate --> WaitInfra4
        
        WaitInfra1 -- Yes --> DeployIndexer[Deploy Indexer<br/>to ECS]
        WaitInfra2 -- Yes --> DeployLiquidator[Deploy Liquidator<br/>to ECS]
        WaitInfra3 -- Yes --> DeployDispatcher[Deploy Dispatcher<br/>Lambda Function]
        WaitInfra4 -- Yes --> DeployOracleUpdater[Deploy Oracle Updater<br/>Lambda Function]
        
        DeployIndexer --> IndexerComplete([Indexer Deployed])
        DeployLiquidator --> LiquidatorComplete([Liquidator Deployed])
        DeployDispatcher --> DispatcherComplete([Dispatcher Deployed])
        DeployOracleUpdater --> OracleComplete([Oracle Updater Deployed])
    end
    
    InfraGate -- Failed --> BlockDeploy([Block All Service Deployments])
    
    style Start fill:#e1f5ff
    style PreCheck fill:#fff4e1
    style SetEnv fill:#e8f5e9
    style Filter fill:#f3e5f5
    style End fill:#ffe1e1
    style DeployShared fill:#bbdefb
    style MainnetDeploy fill:#bbdefb
    style StokenetDeploy fill:#bbdefb
    style InfraGate fill:#fff9c4
    style BuildIndexer fill:#c8e6c9
    style BuildLiquidator fill:#c8e6c9
    style DeployIndexer fill:#81c784
    style DeployLiquidator fill:#81c784
    style DeployDispatcher fill:#81c784
    style DeployOracleUpdater fill:#81c784
    style BlockDeploy fill:#ef5350
    style IndexerFailed fill:#ef5350
    style LiquidatorFailed fill:#ef5350
    style DeployGate fill:#c5e1a5
```
