const {
  BN,
  ether,
  expectRevert,
  time,
  balance,
} = require('openzeppelin-test-helpers');
const {expect} = require('chai');

const UnitTestStakers = artifacts.require('UnitTestStakers');
const getDeposition = async (depositor, to) => this.sfc.delegations_v2.call(depositor, to);
const getStaker = async (stakerID) => this.sfc.stakers.call(stakerID);

contract('SFC', async ([firstStaker, secondStaker, thirdStaker, firstDepositor, secondDepositor, thirdDepositor]) => {
  beforeEach(async () => {
    this.firstEpoch = 0;
    this.sfc = await UnitTestStakers.new(this.firstEpoch);
    this.validatorComission = new BN('150000'); // 0.15
  });

  describe ('Methods tests', async () => {
    it('checking Staker parameters', async () => {
      expect(await this.sfc.minStake.call()).to.be.bignumber.equal(ether('1.0'));
      expect(await this.sfc.minDelegation.call()).to.be.bignumber.equal(ether('1.0'));
      expect(await this.sfc.maxDelegatedRatio.call()).to.be.bignumber.equal(new BN('15000000'));
      expect(await this.sfc.validatorCommission.call()).to.be.bignumber.equal(this.validatorComission);
      expect(await this.sfc.stakeLockPeriodTime.call()).to.be.bignumber.equal(new BN('86400').mul(new BN('7')));
      expect(await this.sfc.stakeLockPeriodEpochs.call()).to.be.bignumber.equal(new BN('3'));
      expect(await this.sfc.delegationLockPeriodTime.call()).to.be.bignumber.equal(new BN('86400').mul(new BN('7')));
      expect(await this.sfc.delegationLockPeriodEpochs.call()).to.be.bignumber.equal(new BN('3'));
    });

    it('checking createStake function', async () => {
      const stakerMetadata = "0x0001";
      expect(await this.sfc.stakersNum.call()).to.be.bignumber.equal(new BN('0'));
      await this.sfc._createStake({from: firstStaker, value: ether('2.0')});
      await this.sfc.createStake(stakerMetadata, {from: secondStaker, value: ether('1.01')});
      await expectRevert(this.sfc._createStake({from: thirdStaker, value: ether('0.99')}), 'insufficient amount');
      await expectRevert(this.sfc._createStake({from: firstStaker}), 'staker already exists');

      expect(await this.sfc.stakersNum.call()).to.be.bignumber.equal(new BN('2'));
      expect(await this.sfc.stakeTotalAmount.call()).to.be.bignumber.equal(ether('3.01'));
      expect(await this.sfc.stakersLastID.call()).to.be.bignumber.equal(new BN('2'));

      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      let secondStakerID = await this.sfc.getStakerID(secondStaker);
      expect(firstStakerID).to.be.bignumber.equal(new BN('1'));
      expect(secondStakerID).to.be.bignumber.equal(new BN('2'));

      expect(await this.sfc.stakerMetadata.call(firstStakerID)).to.be.null;
      expect(await this.sfc.stakerMetadata.call(secondStakerID)).to.be.equal(stakerMetadata);

      expect((await this.sfc.stakers.call(firstStakerID)).stakeAmount).to.be.bignumber.equal(ether('2.0'));
      expect((await this.sfc.stakers.call(firstStakerID)).createdEpoch).to.be.bignumber.equal(new BN('1'));
      expect((await this.sfc.stakers.call(firstStakerID)).sfcAddress).to.equal(firstStaker);
      expect((await this.sfc.stakers.call(firstStakerID)).dagAddress).to.equal(firstStaker);

      expect((await this.sfc.stakers.call(secondStakerID)).stakeAmount).to.be.bignumber.equal(ether('1.01'));
      expect((await this.sfc.stakers.call(secondStakerID)).createdEpoch).to.be.bignumber.equal(new BN('1'));
      expect((await this.sfc.stakers.call(secondStakerID)).sfcAddress).to.equal(secondStaker);
      expect((await this.sfc.stakers.call(secondStakerID)).dagAddress).to.equal(secondStaker);
    });

    it('checking increaseStake function', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('2.0')});
      await this.sfc.increaseStake({from: firstStaker, value: ether('1.0')});
      await this.sfc.increaseStake({from: firstStaker, value: ether('1.0')});
      await this.sfc.increaseStake({from: firstStaker, value: ether('1.0')});
      await expectRevert(this.sfc.increaseStake({
        from: secondStaker,
        value: ether('1.0')
      }), "staker doesn't exist");

      let firstStakerID = await this.sfc.getStakerID(firstStaker);

      expect(await this.sfc.stakeTotalAmount.call()).to.be.bignumber.equal(ether('5.0'));
      expect((await this.sfc.stakers.call(firstStakerID)).stakeAmount).to.be.bignumber.equal(ether('5.0'));
    });

    it('checking createDelegation function', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('2.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      let secondStakerID = new BN('2');
      let zeroStakerID = new BN('2');

      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('1.0')});
      await expectRevert(this.sfc.createDelegation(secondStakerID, {
        from: secondDepositor,
        value: ether('1.0')
      }), "staker doesn't exist");
      await expectRevert(this.sfc.createDelegation(zeroStakerID, {
        from: secondDepositor,
        value: ether('1.0')
      }), "staker doesn't exist");
      await expectRevert(this.sfc.createDelegation(firstStakerID, {
        from: secondDepositor,
        value: ether('0.99')
      }), 'insufficient amount');
      await expectRevert(this.sfc.createDelegation(firstStakerID, {
        from: secondDepositor,
        value: ether('29.01')
      }), "staker's limit is exceeded");
      await this.sfc.createDelegation(firstStakerID, {from: secondDepositor, value: ether('29.0')});

      const now = await time.latest();

      const firstDepositionEntity = await getDeposition(firstDepositor, firstStakerID);
      const firstStakerEntity = await getStaker(firstStakerID);
      expect(firstDepositionEntity.amount).to.be.bignumber.equal(ether('1'));
      expect(firstDepositionEntity.createdEpoch).to.be.bignumber.equal(new BN('1'));
      expect(now.sub(firstDepositionEntity.createdTime)).to.be.bignumber.lessThan(new BN('5'));
      expect(firstDepositionEntity.toStakerID).to.be.bignumber.equal(firstStakerID);

      const secondDepositionEntity = await getDeposition(secondDepositor, firstStakerID);
      expect(secondDepositionEntity.amount).to.be.bignumber.equal(ether('29'));
      expect(secondDepositionEntity.createdEpoch).to.be.bignumber.equal(new BN('1'));
      expect(now.sub(secondDepositionEntity.createdTime)).to.be.bignumber.lessThan(new BN('2'));
      expect(secondDepositionEntity.toStakerID).to.be.bignumber.equal(firstStakerID);

      expect(firstStakerEntity.delegatedMe).to.be.bignumber.equal(ether('30.0'));
      expect(await this.sfc.delegationsTotalAmount.call()).to.be.bignumber.equal(ether('30.0'));
      expect(await this.sfc.delegationsNum.call()).to.be.bignumber.equal(new BN('2'));
    });

    it('checking createDelegation function to several stakers', async () => {
      const _createDelegation = async(depositor, stakerID, amount, epoch) => {
        await this.sfc.createDelegation(stakerID, { from: depositor, value: amount});
        const now = await time.latest();
        const deposition = await getDeposition(depositor, stakerID);

        expect(deposition.amount).to.be.bignumber.equal(amount);
        expect(deposition.createdEpoch).to.be.bignumber.equal(epoch);
        expect(now.sub(deposition.createdTime)).to.be.bignumber.lt(new BN('3'));
        expect(deposition.toStakerID).to.be.bignumber.equal(stakerID);
      }

      await this.sfc._createStake({from: firstStaker, value: ether('2.0')});
      await this.sfc._createStake({from: secondStaker, value: ether('2.0')});
      await this.sfc._createStake({from: thirdStaker, value: ether('2.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      let secondStakerID = await this.sfc.getStakerID(secondStaker);
      let thirdStakerID = await this.sfc.getStakerID(thirdStaker);

      const currentEpoch = (await this.sfc.currentSealedEpoch()).add(new BN ('1'));
      await _createDelegation(firstDepositor, firstStakerID, ether('1.0'), currentEpoch);
      await _createDelegation(firstDepositor, secondStakerID, ether('2.0'), currentEpoch);
      await _createDelegation(firstDepositor, thirdStakerID, ether('4.0'), currentEpoch);
      await expectRevert(this.sfc.createDelegation(firstStakerID, {
        from: firstDepositor,
        value: ether('1.0')
      }), 'delegation already exists');

      const firstStakerEntity = await getStaker(firstStakerID);
      expect(firstStakerEntity.delegatedMe).to.be.bignumber.equal(ether('1.0'));

      const secondStakerEntity = await getStaker(secondStakerID);
      expect(secondStakerEntity.delegatedMe).to.be.bignumber.equal(ether('2.0'));

      const thirdStakerEntity = await getStaker(thirdStakerID);
      expect(thirdStakerEntity.delegatedMe).to.be.bignumber.equal(ether('4.0'));

      expect(await this.sfc.delegationsTotalAmount.call()).to.be.bignumber.equal(ether('7.0'));
      expect(await this.sfc.delegationsNum.call()).to.be.bignumber.equal(new BN('3'));
    });

    it('checking calcRawValidatorEpochReward function', async () => {
      expect(await this.sfc.calcRawValidatorEpochReward(new BN('1'), new BN('1'))).to.be.bignumber.equal(ether('0.0'));
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('5.0')});
      await this.sfc.createDelegation(firstStakerID, {from: secondDepositor, value: ether('10.0')});

      await this.sfc._createStake({from: secondStaker, value: ether('2.0')});
      let secondStakerID = await this.sfc.getStakerID(secondStaker);
      await this.sfc.makeEpochSnapshots(1000000000);

      expect(await this.sfc.calcRawValidatorEpochReward(firstStakerID, new BN('1'))).to.be.bignumber.equal(ether('1.333333333333333263'));
      expect(await this.sfc.calcRawValidatorEpochReward(secondStakerID, new BN('1'))).to.be.bignumber.equal(ether('0.166666666666666735'));
    });

    it('checking epoch snapshot logic', async () => {
      const firstEpochDuration = 1000000000;
      const secondEpochDuration = 1;

      let epoch = await this.sfc.currentSealedEpoch.call();
      expect(epoch).to.be.bignumber.equal(new BN('0'));

      await this.sfc.makeEpochSnapshots(firstEpochDuration);
      epoch = await this.sfc.currentSealedEpoch.call();
      expect(epoch).to.be.bignumber.equal(new BN('1'));
      let snapshot = await this.sfc.epochSnapshots.call(epoch);
      expect(snapshot.duration).to.be.bignumber.equal(new BN(firstEpochDuration.toString()));

      await this.sfc.makeEpochSnapshots(secondEpochDuration);
      epoch = await this.sfc.currentSealedEpoch.call();
      expect(epoch).to.be.bignumber.equal(new BN('2'));
      snapshot = await this.sfc.epochSnapshots.call(epoch);
      expect(snapshot.duration).to.be.bignumber.equal(new BN(secondEpochDuration.toString()));
    });

    it('checking calcValidatorEpochReward function', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('5.0')});
      await this.sfc.createDelegation(firstStakerID, {from: secondDepositor, value: ether('10.0')});

      await this.sfc._createStake({from: secondStaker, value: ether('1.0')});
      let secondStakerID = await this.sfc.getStakerID(secondStaker);
      await this.sfc.makeEpochSnapshots(10000);//dDepositor, value: ether('10.0')});

      await this.sfc._createStake({from: thirdStaker, value: ether('1.0')});
      let thirdStakerID = await this.sfc.getStakerID(thirdStaker);
      await this.sfc.makeEpochSnapshots(10000);

      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, new BN('1'), this.validatorComission)).to.be.bignumber.equal(ether('0.267647249999999983'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, new BN('1'), this.validatorComission)).to.be.bignumber.equal(ether('0.082353000000000076'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, new BN('1'), this.validatorComission)).to.be.bignumber.equal(ether('0'));
    });

    it('checking calcDelegationEpochReward function', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('5.0')});
      await this.sfc.createDelegation(firstStakerID, {from: secondDepositor, value: ether('10.0')});

      await this.sfc._createStake({from: secondStaker, value: ether('1.0')});
      let secondStakerID = await this.sfc.getStakerID(secondStaker);
      await this.sfc.makeEpochSnapshots(10000);

      await this.sfc._createStake({from: thirdStaker, value: ether('1.0')});
      let thirdStakerID = await this.sfc.getStakerID(thirdStaker);
      await this.sfc.makeEpochSnapshots(10000);

      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, new BN('1'), ether('15.0'), this.validatorComission)).to.be.bignumber.equal(ether('1.050000749999999937'));
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, thirdStakerID, new BN('1'), ether('0'), this.validatorComission)).to.be.bignumber.equal(ether('0'));
    });

    it('checking claimDelegationRewards function', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('5.0')});
      await this.sfc.makeEpochSnapshots(5);
      await this.sfc.createDelegation(firstStakerID, {from: secondDepositor, value: ether('10.0')});
      await this.sfc.makeEpochSnapshots(5);
      await this.sfc.makeEpochSnapshots(5);

      await expectRevert(this.sfc.claimDelegationRewards(new BN('1'), firstStakerID, {from: firstStaker}), "delegation doesn't exist");
      await expectRevert(this.sfc.claimDelegationRewards(new BN('0'), firstStakerID, {from: firstDepositor}), 'no epochs claimed');

      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('16.0'));
      const balanceBefore = await balance.current(firstDepositor);

      // reward for epoch 1
      await this.sfc.claimDelegationRewards(new BN('1'), firstStakerID, {from: firstDepositor});
      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('15.008333332979166667')); // 16 - 0.991666667020833333
      // reward for epochs 2, 3
      await this.sfc.claimDelegationRewards(new BN('2'), firstStakerID, {from: firstDepositor});
      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('14.264583332713541667')); // 16 - 1.735416667286458333

      await expectRevert(this.sfc.claimDelegationRewards(new BN('1'), firstStakerID, {from: firstDepositor}), 'future epoch');

      let base = ether('1.735416667286458333');
      let fee = ether('0.005');
      const balanceAfter = await balance.current(firstDepositor);
      expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.least(base.sub(fee));
      expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.most(base);

      await this.sfc.prepareToWithdrawDelegation(firstStakerID, {from: firstDepositor});
      await expectRevert(this.sfc.claimDelegationRewards(new BN('100'), firstStakerID, {from: firstDepositor}), "delegation is deactivated");
    });

    it('checking bonded ratio', async () => {
      let br = await this.sfc.bondedRatio();
      expect(br).to.be.bignumber.equal(new BN('0'));
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      await this.sfc.makeEpochSnapshots(10000);
      // since there is no way to increase snapshot's total_supply, a temprorary mock should be considered
    });

    it('checking claimValidatorRewards function', async () => {
      await expectRevert(this.sfc.claimValidatorRewards(new BN('1'), {from: firstStaker}), 'staker doesn\'t exist');
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('5.0')});
      await this.sfc.makeEpochSnapshots(5);
      await this.sfc.createDelegation(firstStakerID, {from: secondDepositor, value: ether('10.0')});
      await this.sfc.makeEpochSnapshots(5);
      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('16.0'));

      const balanceBefore = await balance.current(firstStaker);

      await this.sfc.claimValidatorRewards(new BN('4'), {from: firstStaker});
      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('15.307291666419270834')); // 16 - 0.692708333580729166

      await expectRevert(this.sfc.claimValidatorRewards(new BN('4'), {from: firstStaker}), 'future epoch');

      let base = ether('0.692708333580729166');
      let fee = ether('0.005');
      const balanceAfter = await balance.current(firstStaker);
      expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.least(base.sub(fee));
      expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.most(base);
    });

    it('checking prepareToWithdrawStake function', async () => {
      const getStaker = async (stakerID) => this.sfc.stakers.call(stakerID);

      let firstStakerID = new BN('1');
      await expectRevert(this.sfc.prepareToWithdrawStake({from: firstStaker}), 'staker doesn\'t exist');
      const firstStakerEntityBefore = await getStaker(firstStakerID);
      expect(firstStakerEntityBefore.deactivatedEpoch).to.be.bignumber.equal(new BN('0'));
      expect(firstStakerEntityBefore.deactivatedTime).to.be.bignumber.equal(new BN('0'));

      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});

      const now = await time.latest();
      await this.sfc.prepareToWithdrawStake({from: firstStaker});

      const firstStakerEntityAfter = await getStaker(firstStakerID);
      expect(firstStakerEntityAfter.deactivatedEpoch).to.be.bignumber.equal(new BN('1'));
      expect(now.sub(firstStakerEntityAfter.deactivatedTime)).to.be.bignumber.lessThan(new BN('5'));
      await expectRevert(this.sfc.prepareToWithdrawStake({from: firstStaker}), "staker is deactivated");
    });

    it('checking withdrawStake function', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.5')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc._createStake({from: secondStaker, value: ether('1.5')});
      let secondStakerID = await this.sfc.getStakerID(secondStaker);
      await this.sfc._createStake({from: thirdStaker, value: ether('1.5')});
      let thirdStakerID = await this.sfc.getStakerID(thirdStaker);

      await expectRevert(this.sfc.withdrawStake({from: firstStaker}), 'staker wasn\'t deactivated');

      await this.sfc.prepareToWithdrawStake({from: firstStaker});
      await this.sfc.prepareToWithdrawStake({from: secondStaker});

      await expectRevert(this.sfc.withdrawStake({from: firstStaker}), 'not enough time passed');
      time.increase(86400 * 7);
      await expectRevert(this.sfc.withdrawStake({from: firstStaker}), 'not enough epochs passed');
      await this.sfc.makeEpochSnapshots(10000);
      await this.sfc.makeEpochSnapshots(10000);
      await this.sfc.makeEpochSnapshots(10000);

      expect(await this.sfc.stakersNum.call()).to.be.bignumber.equal(new BN('3'));
      expect(await this.sfc.stakeTotalAmount.call()).to.be.bignumber.equal(ether('4.5'));
      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('4.5'));
      this.sfc.withdrawStake({from: firstStaker});
      expect(await this.sfc.stakersNum.call()).to.be.bignumber.equal(new BN('2'));
      expect(await this.sfc.stakeTotalAmount.call()).to.be.bignumber.equal(ether('3'));
      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('3'));
      expect(await this.sfc.slashedStakeTotalAmount.call()).to.be.bignumber.equal(ether('0.0'));
      await expectRevert(this.sfc.withdrawStake({from: firstStaker}), 'staker wasn\'t deactivated');

      await this.sfc._markValidationStakeAsCheater(secondStakerID, true);
      this.sfc.withdrawStake({from: secondStaker});
      expect(await this.sfc.stakersNum.call()).to.be.bignumber.equal(new BN('1'));
      expect(await this.sfc.stakeTotalAmount.call()).to.be.bignumber.equal(ether('1.5'));
      expect(await this.sfc.slashedStakeTotalAmount.call()).to.be.bignumber.equal(ether('1.5'));
      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('3'));

      await this.sfc._markValidationStakeAsCheater(thirdStakerID, true);
      let staker = await this.sfc.stakers.call(thirdStakerID);
      expect(staker.status).to.be.bignumber.equal(new BN('1'));

      await this.sfc._markValidationStakeAsCheater(thirdStakerID, false);
      staker = await this.sfc.stakers.call(thirdStakerID);
      expect(staker.status).to.be.bignumber.equal(new BN('0'));
    });

    it('checking prepareToWithdrawDelegation function', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await expectRevert(this.sfc.prepareToWithdrawDelegation(firstStakerID, {from: firstDepositor}), 'delegation doesn\'t exist');
      const firstDepositorEntityBefore = await getDeposition(firstDepositor, firstStakerID);
      expect(firstDepositorEntityBefore.deactivatedEpoch).to.be.bignumber.equal(new BN('0'));
      expect(firstDepositorEntityBefore.deactivatedTime).to.be.bignumber.equal(new BN('0'));

      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('5.0')});

      const firstStakerBefore = await getStaker(firstStakerID);
      expect(firstStakerBefore.delegatedMe).to.be.bignumber.equal(ether('5.0'));
      const now = await time.latest();
      await this.sfc.prepareToWithdrawDelegation(firstStakerID, {from: firstDepositor});
      const firstStakerAfter = await getStaker(firstStakerID);
      expect(firstStakerAfter.delegatedMe).to.be.bignumber.equal(ether('0.0'));

      const firstDepositorEntityAfter = await getDeposition(firstDepositor, firstStakerID);
      expect(firstDepositorEntityAfter.deactivatedEpoch).to.be.bignumber.equal(new BN('1'));
      expect(now.sub(firstDepositorEntityAfter.deactivatedTime)).to.be.bignumber.lessThan(new BN('2'));
      await expectRevert(this.sfc.prepareToWithdrawDelegation(firstStakerID, {from: firstDepositor}), "delegation is deactivated");
    });

    it('checking withdrawDelegation function', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);

      // when delegator doesn't exist
      await expectRevert(this.sfc.withdrawDelegation(firstStakerID, {from: firstDepositor}), 'delegation wasn\'t deactivated');
      await expectRevert(this.sfc.prepareToWithdrawDelegation(firstStakerID, {from: firstDepositor}), 'delegation doesn\'t exist');

      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('1.0')});
      await this.sfc.createDelegation(firstStakerID, {from: secondDepositor, value: ether('1.0')});
      await this.sfc.createDelegation(firstStakerID, {from: thirdDepositor, value: ether('1.0')});

      await expectRevert(this.sfc.withdrawDelegation(firstStakerID, {from: firstDepositor}), 'delegation wasn\'t deactivated');

      await this.sfc.prepareToWithdrawDelegation(firstStakerID, {from: firstDepositor});
      await this.sfc.prepareToWithdrawDelegation(firstStakerID, {from: secondDepositor});

      await expectRevert(this.sfc.withdrawDelegation(firstStakerID, {from: firstDepositor}), 'not enough time passed');
      time.increase(86400 * 7);
      await expectRevert(this.sfc.withdrawDelegation(firstStakerID, {from: firstDepositor}), 'not enough epochs passed');
      await this.sfc.makeEpochSnapshots(10000);
      await this.sfc.makeEpochSnapshots(10000);
      await expectRevert(this.sfc.withdrawDelegation(firstStakerID, {from: firstDepositor}), 'not enough epochs passed');
      await this.sfc.makeEpochSnapshots(10000);

      // check withdrawal after lock period has passed, and staker isn't a cheater
      expect(await this.sfc.delegationsNum.call()).to.be.bignumber.equal(new BN('3'));
      expect(await this.sfc.delegationsTotalAmount.call()).to.be.bignumber.equal(ether('3.0'));
      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('4.0'));
      await this.sfc.withdrawDelegation(firstStakerID, {from: firstDepositor});
      expect(await this.sfc.delegationsNum.call()).to.be.bignumber.equal(new BN('2'));
      expect(await this.sfc.slashedDelegationsTotalAmount.call()).to.be.bignumber.equal(ether('0.0'));
      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('3.0'));
      await expectRevert(this.sfc.withdrawDelegation(firstStakerID, {from: firstDepositor}), 'delegation wasn\'t deactivated');

      // check withdraw with a cheater staker
      await this.sfc._markValidationStakeAsCheater(firstStakerID, true);
      await this.sfc.withdrawDelegation(firstStakerID, {from: secondDepositor});
      expect(await this.sfc.delegationsNum.call()).to.be.bignumber.equal(new BN('1'));
      expect(await this.sfc.delegationsTotalAmount.call()).to.be.bignumber.equal(ether('1.0'));
      expect(await this.sfc.slashedDelegationsTotalAmount.call()).to.be.bignumber.equal(ether('1.0'));
      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('3.0'));

      // check early withdrawal
      await expectRevert(this.sfc.prepareToWithdrawStake({from: firstStaker}), 'not all rewards claimed');
      await this.sfc.discardValidatorRewards({from: firstStaker});
      await this.sfc.prepareToWithdrawStake({from: firstStaker}); // deactivate staker
      {
        time.increase(86400 * 7);
        await this.sfc.makeEpochSnapshots(10000);
        await this.sfc.makeEpochSnapshots(10000);
        await this.sfc.makeEpochSnapshots(10000);
      }
      await expectRevert(this.sfc.prepareToWithdrawDelegation(firstStakerID, {from: thirdDepositor}), 'not all rewards claimed');
      await this.sfc.discardDelegationRewards(firstStakerID, {from: thirdDepositor});
      await this.sfc.prepareToWithdrawDelegation(firstStakerID, {from: thirdDepositor});
      await expectRevert(this.sfc.withdrawDelegation(firstStakerID, {from: thirdDepositor}), 'not enough time passed');
      await this.sfc.withdrawStake({from: firstStaker});
      await this.sfc.withdrawDelegation(firstStakerID, {from: thirdDepositor});

      expect(await this.sfc.slashedDelegationsTotalAmount.call()).to.be.bignumber.equal(ether('2.0'));
      expect(await this.sfc.slashedStakeTotalAmount.call()).to.be.bignumber.equal(ether('1.0'));
      expect(await balance.current(this.sfc.address)).to.be.bignumber.equal(ether('3.0'));
    });
  });
});
