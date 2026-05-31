#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { DiamondHubStack } from '../lib/diamondhub-stack'

const app = new cdk.App()

// Context vars — pass with: cdk deploy -c keyPairName=my-key -c allowSshFromCidr=1.2.3.4/32
const keyPairName: string = app.node.tryGetContext('keyPairName') ?? 'diamondhub-key'
const allowSshFromCidr: string | undefined = app.node.tryGetContext('allowSshFromCidr')
const domainName: string | undefined = app.node.tryGetContext('domainName')

new DiamondHubStack(app, 'DiamondHub', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  keyPairName,
  allowSshFromCidr,
  domainName,
  description: 'DiamondHub — youth travel baseball platform',
})
