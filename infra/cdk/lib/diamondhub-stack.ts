import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'

export interface DiamondHubStackProps extends cdk.StackProps {
  keyPairName: string
  allowSshFromCidr?: string  // restrict SSH; default 0.0.0.0/0 (lock down in prod)
  domainName?: string        // optional custom domain
}

export class DiamondHubStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DiamondHubStackProps) {
    super(scope, id, props)

    // ── VPC ─────────────────────────────────────────────────────────────────
    // No NAT gateway = saves ~$32/mo.
    // EC2 lives in public subnet (needs internet for npm/git).
    // RDS lives in isolated subnet (no internet access — only reachable from EC2).
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { cidrMask: 24, name: 'public', subnetType: ec2.SubnetType.PUBLIC },
        { cidrMask: 24, name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    })

    // ── Security groups ──────────────────────────────────────────────────────
    const apiSg = new ec2.SecurityGroup(this, 'ApiSg', {
      vpc,
      description: 'DiamondHub API + Workers',
      allowAllOutbound: true,
    })
    apiSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP')
    apiSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS')
    apiSg.addIngressRule(
      ec2.Peer.ipv4(props.allowSshFromCidr ?? '0.0.0.0/0'),
      ec2.Port.tcp(22),
      'SSH',
    )

    const rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc,
      description: 'RDS - only reachable from API server',
      allowAllOutbound: false,
    })
    rdsSg.addIngressRule(apiSg, ec2.Port.tcp(5432), 'Postgres from API SG')

    // ── IAM role for EC2 ─────────────────────────────────────────────────────
    const serverRole = new iam.Role(this, 'ServerRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        // Allows SSM Session Manager as SSH alternative (no port 22 needed if preferred)
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    })

    // ── RDS credentials in Secrets Manager ───────────────────────────────────
    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      description: 'DiamondHub RDS credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'diamondhub' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    })
    // EC2 instance can fetch the password via AWS CLI
    dbSecret.grantRead(serverRole)

    // ── EC2 — t4g.small ARM64 ────────────────────────────────────────────────
    // Runs: API (Fastify), Workers (BullMQ), Redis (local), nginx
    // ARM is ~20% cheaper than equivalent x86 for compute
    const server = new ec2.Instance(this, 'Server', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      // Ubuntu 22.04 LTS ARM64
      machineImage: ec2.MachineImage.fromSsmParameter(
        '/aws/service/canonical/ubuntu/server/22.04/stable/current/arm64/hvm/ebs-gp2/ami-id',
        { os: ec2.OperatingSystemType.LINUX },
      ),
      securityGroup: apiSg,
      keyPair: ec2.KeyPair.fromKeyPairName(this, 'KeyPair', props.keyPairName),
      role: serverRole,
      blockDevices: [{
        deviceName: '/dev/sda1',
        volume: ec2.BlockDeviceVolume.ebs(20, {
          volumeType: ec2.EbsDeviceVolumeType.GP3,
          encrypted: true,
        }),
      }],
      associatePublicIpAddress: true,
    })

    // Elastic IP — IP stays stable across reboots/replacements
    const eip = new ec2.CfnEIP(this, 'ServerEip', { domain: 'vpc' })
    new ec2.CfnEIPAssociation(this, 'ServerEipAssoc', {
      instanceId: server.instanceId,
      allocationId: eip.attrAllocationId,
    })

    // ── RDS PostgreSQL 16 with PostGIS ───────────────────────────────────────
    // db.t4g.micro: 2 vCPU, 1 GiB RAM — ~$12/mo
    // PostGIS enabled via CREATE EXTENSION in setup script
    const db = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [rdsSg],
      databaseName: 'diamondhub',
      credentials: rds.Credentials.fromSecret(dbSecret),
      storageType: rds.StorageType.GP3,
      allocatedStorage: 20,
      multiAz: false,           // single-AZ saves ~$12/mo
      deletionProtection: true,
      backupRetention: cdk.Duration.days(7),
      storageEncrypted: true,
      enablePerformanceInsights: false, // save cost
    })

    // ── S3 + CloudFront for frontend SPA ─────────────────────────────────────
    const webBucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // Allow EC2 to push built assets (for deploy-frontend.sh)
    webBucket.grantReadWrite(serverRole)

    // CloudFront with OAC (successor to OAI)
    const oac = new cloudfront.S3OriginAccessControl(this, 'WebOac', {
      signing: cloudfront.Signing.SIGV4_NO_OVERRIDE,
    })

    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      defaultRootObject: 'index.html',
      // React Router SPA — 403/404 → index.html
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US/EU only, cheapest
    })

    // ── Stack outputs ────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ServerIp', {
      value: eip.ref,
      description: 'EC2 Elastic IP — SSH here, also your API host',
    })
    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: db.dbInstanceEndpointAddress,
      description: 'RDS hostname — paste into DATABASE_URL in .env',
    })
    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: dbSecret.secretArn,
      description: 'Secrets Manager ARN — setup.sh reads this for the DB password',
    })
    new cdk.CfnOutput(this, 'WebBucketName', {
      value: webBucket.bucketName,
      description: 'S3 bucket — pass to deploy-frontend.sh',
    })
    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: distribution.distributionDomainName,
      description: 'Frontend URL (point CNAME here for custom domain)',
    })
    new cdk.CfnOutput(this, 'CloudFrontId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID — pass to deploy-frontend.sh',
    })

    // Cost summary tag
    cdk.Tags.of(this).add('Project', 'DiamondHub')
    cdk.Tags.of(this).add('MonthlyCostEstimate', 'approx-29-USD')
  }
}
