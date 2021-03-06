# Opti IoT Vending Machine Tests

First-round test for prospective IoT Site Reliability Engineers at OptiRTC

## Welcome

This repository is the starting point for the new OptiRTC IoT Site Reliability Engineer take-home test. It includes a brief specifications document describing the application you should create to include in your OptiRTC job application. Please follow the Getting Started guide below to submit your application to the OptiRTC development team.

## Getting Started
> If you are not using `nvm`, check that your versions of `nodejs` and `npm` match the required versions specified in [package.json](package.json).

1. Clone this repository to your local system.
2. Run `npm install` from the cloned repository to install dependencies.
3. Follow steps outlined in the [Functional Specification](FunctionalSpec.md).
4. Attach a zip file of your complete repository along with your job application.
   - Exclude items from zip that are in `.gitignore` such as `node_modules` which we can install with `npm install`.

## How you will be evaluated

We are looking to see that you: 
- Make good decisions about separating concerns in your implementation.
- Understand how to unpack messages from a serial input.
- Can reason about signals on GPIO pins.
- Can test expected asynchronous interactions.

We are expecting this task to take you 1-3 hours; please do not spend more than 5 hours on this task.
