# Infrastructure Architecture

This directory contains the Terraform infrastructure configurations for the Weft Backend project. The structure follows a tiered approach to ensure reusability, consistency, and clear environment separation.

## Directory Structure

### 🧩 [modules/](file:///Users/atoumbre/SoftiLab/project-infra/weft-backend/resources/modules)
**Reusable foundational pieces.**
These are granular, generic infrastructure components (e.g., a secure S3 bucket, an ECS service with autoscaling, a VPC). They are designed to be highly reusable and don't contain business logic.

### 🏛️ [blueprints/](file:///Users/atoumbre/SoftiLab/project-infra/weft-backend/resources/blueprints)
**Configurable systems and services.**
Blueprints assemble multiple modules into specialized services (e.g., the `liquitation-service` or `price-updater-service`). They represent the "architecture" of a service. Since we have multiple environments, blueprints allow us to define the system once and configure it differently (different instance sizes, retention policies, etc.) per environment.

### 🌍 [environments/](file:///Users/atoumbre/SoftiLab/project-infra/weft-backend/resources/environments)
**Environment-specific configurations.**
This is where the actual infrastructure is instantiated.
- **`global/`**: Resources that are shared across all environments (formerly `shared`).
- **`mainnet/`**: Production environment configuration.
- **`stokenet/`**: Testnet/Staging environment configuration.

### ⚡ [bootstrap/](file:///Users/atoumbre/SoftiLab/project-infra/weft-backend/resources/bootstrap)
**Initial setup.**
Handles the creation of the backend state storage (S3 bucket) and other prerequisites needed before the main infrastructure can be deployed.

## Philosophy

Our infrastructure-as-code follows a **modular, blueprint-driven** philosophy:
1. **Modules** are the bricks.
2. **Blueprints** are the architectural drawings for a specific room or building.
3. **Environments** are the actual construction of those buildings on different sites, using different parameters but the same blueprints.

This ensures that our production and staging environments remain architecturally identical, with differences limited only to configuration parameters.

## Helper Scripts

- **`./terraform-check-all.sh`**: Validates the formatting and configuration of all environments.
- **`./terraform-init.sh <env>`**: Initializes a specific environment with the correct remote backend configuration.
- **`./terraform-proxy.sh <env> <command>`**: Runs Terraform commands in the context of a specific environment.
