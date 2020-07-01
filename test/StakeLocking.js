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

  describe ('Locking stake tests', async () => {
    it('should start \"locked stake\" feature', async () => {
      await this.sfc.makeEpochSnapshots(5);
      await this.sfc.makeEpochSnapshots(5);
      const sfc_owner = firstStaker; // first address from contract parameters
      const other_address = secondStaker;
      const currentEpoch = await this.sfc.currentEpoch.call();
      await expectRevert(this.sfc.startLockedUp(currentEpoch, { from: other_address }), "Ownable: caller is not the owner");
      await this.sfc.startLockedUp(currentEpoch.add(new BN('5')), { from: sfc_owner });
      expect(await this.sfc.firstLockedUpEpoch.call()).to.be.bignumber.equal(currentEpoch.add(new BN('5')));
      await expectRevert(this.sfc.startLockedUp(currentEpoch.sub((new BN('1'))), { from: sfc_owner }), "can't start in the past");
      await this.sfc.startLockedUp(currentEpoch, { from: sfc_owner });
      expect(await this.sfc.firstLockedUpEpoch.call()).to.be.bignumber.equal(currentEpoch);
      await this.sfc.makeEpochSnapshots(5);
      await this.sfc.makeEpochSnapshots(5);
      const newEpoch = await this.sfc.currentEpoch.call();
      await expectRevert(this.sfc.startLockedUp(newEpoch, { from: sfc_owner }), "feature was started");
    });

    it('should calc raw ValidatorEpochReward correctly after locked up started', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('5.0')});
      await this.sfc.createDelegation(firstStakerID, {from: secondDepositor, value: ether('10.0')});

      await this.sfc._createStake({from: secondStaker, value: ether('1.0')});
      let secondStakerID = await this.sfc.getStakerID(secondStaker);
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #1

      await this.sfc._createStake({from: thirdStaker, value: ether('2.0')});
      let thirdStakerID = await this.sfc.getStakerID(thirdStaker);
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #2

      let epoch = new BN('1');
      expect(await this.sfc.calcRawValidatorEpochReward(firstStakerID, epoch)).to.be.bignumber.equal(ether('0.000000941176470588'));
      expect(await this.sfc.calcRawValidatorEpochReward(secondStakerID, epoch)).to.be.bignumber.equal(ether('0.000000058823529411'));
      expect(await this.sfc.calcRawValidatorEpochReward(thirdStakerID, epoch)).to.be.bignumber.equal(ether('0'));

      epoch = new BN('2');
      expect(await this.sfc.calcRawValidatorEpochReward(firstStakerID, epoch)).to.be.bignumber.equal(ether('0.000000842105263157'));
      expect(await this.sfc.calcRawValidatorEpochReward(secondStakerID, epoch)).to.be.bignumber.equal(ether('0.000000052631578947'));
      expect(await this.sfc.calcRawValidatorEpochReward(thirdStakerID, epoch)).to.be.bignumber.equal(ether('0.000000105263157894'));

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #3
      epoch = new BN('3');
      // last epoch without LockedUp
      expect(await this.sfc.calcRawValidatorEpochReward(firstStakerID, epoch)).to.be.bignumber.equal(ether('0.000000842105263157'));
      expect(await this.sfc.calcRawValidatorEpochReward(secondStakerID, epoch)).to.be.bignumber.equal(ether('0.000000052631578947'));
      expect(await this.sfc.calcRawValidatorEpochReward(thirdStakerID, epoch)).to.be.bignumber.equal(ether('0.000000105263157894'));
      // start LockedUp
      const sfc_owner = firstStaker;
      const currentEpoch = await this.sfc.currentEpoch.call();
      expect(currentEpoch).to.be.bignumber.equal(new BN("4"));
      await this.sfc.startLockedUp(currentEpoch, { from: sfc_owner });

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #4
      epoch = new BN('4');
      // reduce unlock stake by 70%
      expect(await this.sfc.calcRawValidatorEpochReward(firstStakerID, epoch)).to.be.bignumber.equal(ether('0.000000252631578947'));
      expect(await this.sfc.calcRawValidatorEpochReward(secondStakerID, epoch)).to.be.bignumber.equal(ether('0.000000015789473684'));
      expect(await this.sfc.calcRawValidatorEpochReward(thirdStakerID, epoch)).to.be.bignumber.equal(ether('0.000000031578947368'));

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #5
      epoch = new BN('5');
      // reduce unlock stake by 70%
      expect(await this.sfc.calcRawValidatorEpochReward(firstStakerID, epoch)).to.be.bignumber.equal(ether('0.000000252631578947'));
      expect(await this.sfc.calcRawValidatorEpochReward(secondStakerID, epoch)).to.be.bignumber.equal(ether('0.000000015789473684'));
      expect(await this.sfc.calcRawValidatorEpochReward(thirdStakerID, epoch)).to.be.bignumber.equal(ether('0.000000031578947368'));
    });

    it('should lock stake', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('5.0')});
      await this.sfc.createDelegation(firstStakerID, {from: thirdDepositor, value: ether('10.0')});

      await this.sfc._createStake({from: secondStaker, value: ether('1.0')});
      let secondStakerID = await this.sfc.getStakerID(secondStaker);
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #1

      await this.sfc._createStake({from: thirdStaker, value: ether('2.0')});
      let thirdStakerID = await this.sfc.getStakerID(thirdStaker);
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #2

      let epoch = new BN('1');
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000191176470588'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000058823529411'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0'));

      epoch = new BN('2');
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000171052631578'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000052631578947'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000105263157894'));

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #3
      epoch = new BN('3');
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000171052631578'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000052631578947'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000105263157894'));

      const duration = (new BN('86400')).mul(new BN('14'));
      await expectRevert(this.sfc.lockUpStake(duration, { from: firstStaker }), "feature was not activated");
      // start LockedUp
      const sfc_owner = firstStaker;
      const currentEpoch = await this.sfc.currentEpoch.call();
      expect(currentEpoch).to.be.bignumber.equal(new BN("4"));
      const startLockedUpEpoch = new BN("5");
      await this.sfc.startLockedUp(startLockedUpEpoch, { from: sfc_owner });

      await expectRevert(this.sfc.lockUpStake(duration, { from: firstStaker }), "feature was not activated");

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #4
      epoch = new BN('4');
      // last epoch without LockedUp
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000171052631578'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000052631578947'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000105263157894'));

      await this.sfc.lockUpStake(duration, { from: firstStaker });
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #5
      epoch = new BN('5');

      // add 70% reward for first staker
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000751315789473'));
      // reduce unlock stake by 70%
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000015789473684'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000067105263157'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000134210526315'));

      time.increase(10000);
      await this.sfc.lockUpStake(duration, { from: secondStaker });
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #6
      epoch = new BN('6');
      // split 70% reward between first and second stakers
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000401315789473'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000365789473684'));
      // reduce unlock stake by 70%
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));

      epoch = new BN('7');
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #7
      // split 70% reward between first and second stakers
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000401315789473'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000365789473684'));
      // reduce unlock stake by 70%
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));
      // first locking has ended
      time.increase(86400 * 14 - 9999);
      await this.sfc.makeEpochSnapshots(); // epoch #8
      epoch = new BN('9');
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #9
      // reduce unlock stake by 70%
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000051315789473'));
      // add 70% reward for second staker
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000715789473684'));
      // reduce unlock stake by 70%
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));
      // second locking has ended
      epoch = new BN('10');
      time.increase(10002);
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #10
      // reduce unlock stake by 70%
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000051315789473'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000015789473684'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));

      epoch = new BN('11');
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #11
      // reduce unlock stake by 70%
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000051315789473'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000015789473684'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));
    });

    it('should lock stake with right duration', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      await this.sfc._createStake({from: secondStaker, value: ether('1.0')});
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #1

      const minDuration = (new BN('86400')).mul(new BN('14'));
      const maxDuration = (new BN('86400')).mul(new BN('365'));
      // start LockedUp
      const sfc_owner = firstStaker;
      const startLockedUpEpoch = new BN("2");
      await this.sfc.startLockedUp(startLockedUpEpoch, { from: sfc_owner });

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #2

      await expectRevert(this.sfc.lockUpStake(minDuration.sub(new BN("1")), { from: firstStaker }), "incorrect duration");
      await this.sfc.lockUpStake(minDuration, { from: firstStaker });
      await expectRevert(this.sfc.lockUpStake(maxDuration.add(new BN("1")), { from: secondStaker }), "incorrect duration");
      await this.sfc.lockUpStake(maxDuration, { from: secondStaker });
      await expectRevert(this.sfc.lockUpStake(minDuration, { from: secondStaker }), "already locked up");
      await this.sfc.lockUpStake(maxDuration, { from: firstStaker });
    });

    it('should not call prepareToWithdrawStake, until locked time is pass', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #1

      const duration = (new BN('86400')).mul(new BN('14'));
      // start LockedUp
      const sfc_owner = firstStaker;
      const startLockedUpEpoch = new BN("2");
      await this.sfc.startLockedUp(startLockedUpEpoch, { from: sfc_owner });

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #2

      await this.sfc.lockUpStake(duration, { from: firstStaker });
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #3
      await this.sfc.discardValidatorRewards({from: firstStaker});
      await expectRevert(this.sfc.prepareToWithdrawStake({ from: firstStaker }), "stake is locked");
      time.increase(86400 * 14 - 2);
      await expectRevert(this.sfc.prepareToWithdrawStake({ from: firstStaker }), "stake is locked");
      time.increase(3);
      await this.sfc.prepareToWithdrawStake({ from: firstStaker });
    });

    it('should not call prepareToWithdrawStakePartial, until locked time is pass', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('2.0')});
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #1

      const duration = (new BN('86400')).mul(new BN('14'));
      // start LockedUp
      const sfc_owner = firstStaker;
      const startLockedUpEpoch = new BN("2");
      await this.sfc.startLockedUp(startLockedUpEpoch, { from: sfc_owner });

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #2

      await this.sfc.lockUpStake(duration, { from: firstStaker });
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #3
      await this.sfc.discardValidatorRewards({from: firstStaker});
      const wrID = new BN('1');
      await expectRevert(this.sfc.prepareToWithdrawStakePartial(wrID, ether('1.0'), { from: firstStaker }), "stake is locked");
      time.increase(86400 * 14 - 2);
      await expectRevert(this.sfc.prepareToWithdrawStakePartial(wrID, ether('1.0'), { from: firstStaker }), "stake is locked");
      time.increase(3);
      await this.sfc.prepareToWithdrawStakePartial(wrID, ether('1.0'), { from: firstStaker });
    });

    it('should lock delegation', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('5.0')});
      await this.sfc.createDelegation(firstStakerID, {from: thirdDepositor, value: ether('10.0')});

      await this.sfc._createStake({from: secondStaker, value: ether('1.0')});
      let secondStakerID = await this.sfc.getStakerID(secondStaker);
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #1

      await this.sfc._createStake({from: thirdStaker, value: ether('2.0')});
      let thirdStakerID = await this.sfc.getStakerID(thirdStaker);
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #2

      let epoch = new BN('1');
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000191176470588'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000058823529411'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0'));
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000249999999999'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000499999999999'));

      epoch = new BN('2');
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000171052631578'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000052631578947'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000105263157894'));
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000223684210526'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000447368421052'));

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #3
      epoch = new BN('3');
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000171052631578'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000052631578947'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000105263157894'));
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000223684210526'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000447368421052'));

      const duration = (new BN('86400')).mul(new BN('14'));
      await expectRevert(this.sfc.lockUpStake(duration, { from: firstStaker }), "feature was not activated");
      // start LockedUp
      const sfc_owner = firstStaker;
      const currentEpoch = await this.sfc.currentEpoch.call();
      expect(currentEpoch).to.be.bignumber.equal(new BN("4"));
      const startLockedUpEpoch = new BN("5");
      await this.sfc.startLockedUp(startLockedUpEpoch, { from: sfc_owner });

      await expectRevert(this.sfc.lockUpStake(duration, { from: firstStaker }), "feature was not activated");

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #4
      epoch = new BN('4');
      // last epoch without LockedUp
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000171052631578'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000052631578947'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000105263157894'));
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000223684210526'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000447368421052'));

      await expectRevert(this.sfc.lockUpDelegation(duration, firstStakerID, { from: firstDepositor }), "staker's locking will finish first");
      await this.sfc.lockUpStake(duration.add(new BN("10")), { from: firstStaker });
      await this.sfc.lockUpDelegation(duration, firstStakerID, { from: firstDepositor });
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #5
      epoch = new BN('5');

      // split 70% reward between first staker and first delegator
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000167982456139'));
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000650438596490'));
      // reduce unlock stake by 70%
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000015789473684'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000134210526315'));
      time.increase(5);
      await this.sfc.lockUpDelegation(duration, firstStakerID, { from: thirdDepositor });

      time.increase(10000);
      await this.sfc.lockUpStake(duration, { from: secondStaker });
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #6
      epoch = new BN('6');
      // split 70% reward between first/second stakers/delegators
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000092492260061'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000056965944272'));
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000272987616098'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000545975232197'));
      // reduce unlock stake by 70%
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));

      epoch = new BN('7');
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #7
      // split 70% reward between first/second stakers/delegators
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000092492260061'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000056965944272'));
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000272987616098'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000545975232197'));
      // reduce unlock stake by 70%
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));
      // first delegation locking has ended
      time.increase(86400 * 14 - 10002);
      await this.sfc.makeEpochSnapshots(); // epoch #8

      epoch = new BN('9');
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #9
      // split 70% reward between first/second stakers and second delegator
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000109649122806'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000074122807017'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000717543859648'));
      // reduce unlock stake by 70%
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000067105263157'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));

      time.increase(20);
      await this.sfc.makeEpochSnapshots(); // epoch #10

      // second delegation and first stake lockings have ended
      epoch = new BN('11');
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #11
      // add 70% reward for second staker
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000715789473684'));
      // reduce unlock stake by 70%
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000067105263157'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000134210526315'));
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000051315789473'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));

      // all lockings have ended
      time.increase(10000);
      epoch = new BN('12');
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #12
      // reduce unlock stake by 70%
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000067105263157'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000134210526315'));
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000051315789473'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000015789473684'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));

      epoch = new BN('13');
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #13
      // reduce unlock stake by 70%
      expect(await this.sfc.calcDelegationEpochReward(firstDepositor, firstStakerID, epoch, ether('5.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000067105263157'));
      expect(await this.sfc.calcDelegationEpochReward(thirdDepositor, firstStakerID, epoch, ether('10.0'), this.validatorComission)).to.be.bignumber.equal(ether('0.000000134210526315'));
      expect(await this.sfc.calcValidatorEpochReward(firstStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000051315789473'));
      expect(await this.sfc.calcValidatorEpochReward(secondStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000015789473684'));
      expect(await this.sfc.calcValidatorEpochReward(thirdStakerID, epoch, this.validatorComission)).to.be.bignumber.equal(ether('0.000000031578947368'));
    });

    it('should lock delegation with right duration', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      await this.sfc._createStake({from: secondStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      let secondStakerID = await this.sfc.getStakerID(secondStaker);
      await this.sfc.createDelegation(secondStakerID, {from: firstDepositor, value: ether('1.0')});
      await this.sfc.createDelegation(firstStakerID, {from: secondDepositor, value: ether('1.0')});
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #1

      const minDuration = (new BN('86400')).mul(new BN('14'));
      const maxDuration = (new BN('86400')).mul(new BN('365'));
      // start LockedUp
      const sfc_owner = firstStaker;
      const startLockedUpEpoch = new BN("2");
      await this.sfc.startLockedUp(startLockedUpEpoch, { from: sfc_owner });

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #2

      await this.sfc.lockUpStake(maxDuration, { from: firstStaker });
      await this.sfc.lockUpStake(minDuration.mul(new BN("2")), { from: secondStaker });

      await expectRevert(this.sfc.lockUpDelegation(minDuration.sub(new BN("1")), secondStakerID, { from: firstDepositor }), "incorrect duration");
      await this.sfc.lockUpDelegation(minDuration, secondStakerID, { from: firstDepositor });
      await expectRevert(this.sfc.lockUpDelegation(maxDuration.add(new BN("1")), firstStakerID, { from: secondDepositor }), "incorrect duration");
      await this.sfc.lockUpDelegation(maxDuration.sub(new BN("1")), firstStakerID, { from: secondDepositor });
      await expectRevert(this.sfc.lockUpDelegation(minDuration, firstStakerID, { from: secondDepositor }), "already locked up");
      await expectRevert(this.sfc.lockUpDelegation(minDuration.mul(new BN("3")), secondStakerID, { from: firstDepositor }), "staker's locking will finish first");
      await this.sfc.lockUpDelegation(minDuration.add(new BN("2")), secondStakerID, { from: firstDepositor });
    });

    it('should subtract penalty if prepareToWithdrawDelegation will call earlier than locked time is pass', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('10.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('1.0')});
      await this.sfc.createDelegation(firstStakerID, {from: secondDepositor, value: ether('1.0')});
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #1

      const duration = (new BN('86400')).mul(new BN('14'));
      // start LockedUp
      const sfc_owner = firstStaker;
      const startLockedUpEpoch = new BN("2");
      await this.sfc.startLockedUp(startLockedUpEpoch, { from: sfc_owner });

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #2

      await this.sfc.lockUpStake(duration.add(new BN('5')), { from: firstStaker });
      await this.sfc.lockUpDelegation(duration, firstStakerID, { from: firstDepositor });
      await this.sfc.lockUpDelegation(duration, firstStakerID, { from: secondDepositor });
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #3
      await this.sfc.discardDelegationRewards(firstStakerID, {from: firstDepositor});
      await this.sfc.discardDelegationRewards(firstStakerID, {from: secondDepositor});
      time.increase(86400 * 14 - 2);
      const penalty = await this.sfc.calcDelegationPenalty(firstDepositor, firstStakerID, ether('1.0'));
      expect(penalty).to.be.bignumber.equal(ether('0.000000068958333333'));
      await this.sfc.prepareToWithdrawDelegation(firstStakerID, { from: firstDepositor });
      const firstDeposition = await getDeposition(firstDepositor, firstStakerID);
      expect(firstDeposition.amount).to.be.bignumber.equal(ether('1.0').sub(penalty));
      time.increase(3);
      await this.sfc.prepareToWithdrawDelegation(firstStakerID, { from: secondDepositor });
      const secondDeposition = await getDeposition(secondDepositor, firstStakerID);
      expect(secondDeposition.amount).to.be.bignumber.equal(ether('1.0'));
    });

    it('should subtract penalty if prepareToWithdrawDelegationPartial will call earlier than locked time is pass', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('20.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc.createDelegation(firstStakerID, {from: firstDepositor, value: ether('2.0')});
      await this.sfc.createDelegation(firstStakerID, {from: secondDepositor, value: ether('2.0')});
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #1

      const duration = (new BN('86400')).mul(new BN('14'));
      // start LockedUp
      const sfc_owner = firstStaker;
      const startLockedUpEpoch = new BN("2");
      await this.sfc.startLockedUp(startLockedUpEpoch, { from: sfc_owner });

      await this.sfc.makeEpochSnapshots(10000, false); // epoch #2

      await this.sfc.lockUpStake(duration.add(new BN('5')), { from: firstStaker });
      await this.sfc.lockUpDelegation(duration, firstStakerID, { from: firstDepositor });
      await this.sfc.lockUpDelegation(duration, firstStakerID, { from: secondDepositor });
      await this.sfc.makeEpochSnapshots(10000, false); // epoch #3
      await this.sfc.discardDelegationRewards(firstStakerID, {from: firstDepositor});
      await this.sfc.discardDelegationRewards(firstStakerID, {from: secondDepositor});
      time.increase(86400 * 14 - 2);
      const penalty = await this.sfc.calcDelegationPenalty(firstDepositor, firstStakerID, ether('1.0'));
      expect(penalty).to.be.bignumber.equal(ether('0.000000034479166666')); // 50% for reward
      const wrID = new BN('1');
      await this.sfc.prepareToWithdrawDelegationPartial(wrID, firstStakerID, ether('1.0'), { from: firstDepositor });
      const firstDeposition = await getDeposition(firstDepositor, firstStakerID);
      expect(firstDeposition.amount).to.be.bignumber.equal(ether('1.0').sub(penalty));
      time.increase(3);
      await this.sfc.prepareToWithdrawDelegationPartial(wrID.add(new BN('1')), firstStakerID, ether('1.0'), { from: secondDepositor });
      const secondDeposition = await getDeposition(secondDepositor, firstStakerID);
      expect(secondDeposition.amount).to.be.bignumber.equal(ether('1.0'));
    });

    it('should change delegation', async () => {
      await this.sfc._createStake({from: firstStaker, value: ether('1.0')});
      let firstStakerID = await this.sfc.getStakerID(firstStaker);
      await this.sfc.createDelegation(firstStakerID, { from: firstDepositor, value: ether('5.0') });
      await this.sfc.createDelegation(firstStakerID, { from: secondDepositor, value: ether('5.0') });
      await this.sfc.createDelegation(firstStakerID, { from: thirdDepositor, value: ether('5.0') });
      await this.sfc._createStake({from: secondStaker, value: ether('1.0')});
      let secondStakerID = await this.sfc.getStakerID(secondStaker);
      await this.sfc.makeEpochSnapshots(10000); // epoch #1

      await this.sfc._createStake({from: thirdStaker, value: ether('2.0')});
      let thirdStakerID = await this.sfc.getStakerID(thirdStaker);
      await this.sfc.makeEpochSnapshots(10000); // epoch #2
      await expectRevert(this.sfc.changeDelegation(firstStakerID, firstStakerID, { from: firstDepositor }), "delegation already exists");
      await expectRevert(this.sfc.changeDelegation(secondStakerID, secondStakerID, { from: firstDepositor }), "delegation doesn't exist");
      await this.sfc.claimDelegationRewards(2, firstStakerID, { from: secondDepositor });
      await this.sfc.prepareToWithdrawDelegation(firstStakerID, { from: secondDepositor });
      await expectRevert(this.sfc.changeDelegation(firstStakerID, secondStakerID, { from: secondDepositor }), "delegation is deactivated");
      await expectRevert(this.sfc.changeDelegation(firstStakerID, secondStakerID, { from: firstDepositor }), "not all rewards claimed");
      await this.sfc.claimDelegationRewards(2, firstStakerID, { from: firstDepositor });
      await this.sfc.changeDelegation(firstStakerID, secondStakerID, { from: firstDepositor });

      const sfc_owner = firstStaker;
      const currentEpoch = await this.sfc.currentEpoch.call();
      await this.sfc.startLockedUp(currentEpoch, { from: sfc_owner });
      const duration = (new BN('86400')).mul(new BN('14'));
      await this.sfc.lockUpStake(duration.mul(new BN('2')), { from: firstStaker });
      await this.sfc.lockUpStake(duration, { from: secondStaker });
      await this.sfc.lockUpStake(duration.mul(new BN('2')), { from: thirdStaker });
      await this.sfc.lockUpDelegation(duration.mul(new BN('2')).sub(new BN('10')), firstStakerID, { from: thirdDepositor });
      await this.sfc.claimDelegationRewards(2, firstStakerID, { from: thirdDepositor });
      await expectRevert(this.sfc.changeDelegation(firstStakerID, secondStakerID, { from: thirdDepositor }), "staker's locking will finish first");
      let thirdDeposition = await getDeposition(thirdDepositor, firstStakerID);
      expect(thirdDeposition.createdEpoch).to.be.bignumber.equal(new BN ('1'));
      expect(thirdDeposition.deactivatedEpoch).to.be.bignumber.equal(new BN ('0'));
      expect(thirdDeposition.deactivatedTime).to.be.bignumber.equal(new BN ('0'));
      expect(thirdDeposition.amount).to.be.bignumber.equal(ether('5.0'));
      expect(thirdDeposition.paidUntilEpoch).to.be.bignumber.equal(new BN ('2'));
      expect(thirdDeposition.toStakerID).to.be.bignumber.equal(firstStakerID);

      await this.sfc.changeDelegation(firstStakerID, thirdStakerID, { from: thirdDepositor });
      thirdDeposition = await getDeposition(thirdDepositor, thirdStakerID);
      expect(thirdDeposition.createdEpoch).to.be.bignumber.equal(new BN ('1'));
      expect(thirdDeposition.deactivatedEpoch).to.be.bignumber.equal(new BN ('0'));
      expect(thirdDeposition.deactivatedTime).to.be.bignumber.equal(new BN ('0'));
      expect(thirdDeposition.amount).to.be.bignumber.equal(ether('5.0'));
      expect(thirdDeposition.paidUntilEpoch).to.be.bignumber.equal(new BN ('2'));
      expect(thirdDeposition.toStakerID).to.be.bignumber.equal(thirdStakerID);

      let oldDeposition = await getDeposition(thirdDepositor, firstStakerID);
      expect(oldDeposition.createdEpoch).to.be.bignumber.equal(new BN ('0'));
      expect(oldDeposition.deactivatedEpoch).to.be.bignumber.equal(new BN ('0'));
      expect(oldDeposition.deactivatedTime).to.be.bignumber.equal(new BN ('0'));
      expect(oldDeposition.amount).to.be.bignumber.equal(new BN ('0'));
      expect(oldDeposition.paidUntilEpoch).to.be.bignumber.equal(new BN ('0'));
      expect(oldDeposition.toStakerID).to.be.bignumber.equal(new BN ('0'));


      time.increase(duration.add(new BN('10')));
      await this.sfc.makeEpochSnapshots(); // epoch #3
      await this.sfc.claimDelegationRewards(3, thirdStakerID, { from: thirdDepositor });
      await expectRevert(this.sfc.changeDelegation(thirdStakerID, secondStakerID, { from: thirdDepositor }), "staker's locking will finish first");
      time.increase(duration);
      await this.sfc.makeEpochSnapshots(); // epoch #4
      await this.sfc.claimDelegationRewards(4, thirdStakerID, { from: thirdDepositor });
      await this.sfc.changeDelegation(thirdStakerID, secondStakerID, { from: thirdDepositor });
      thirdDeposition = await getDeposition(thirdDepositor, secondStakerID);
      expect(thirdDeposition.createdEpoch).to.be.bignumber.equal(new BN ('1'));
      expect(thirdDeposition.deactivatedEpoch).to.be.bignumber.equal(new BN ('0'));
      expect(thirdDeposition.deactivatedTime).to.be.bignumber.equal(new BN ('0'));
      expect(thirdDeposition.amount).to.be.bignumber.equal(ether('5.0'));
      expect(thirdDeposition.paidUntilEpoch).to.be.bignumber.equal(new BN ('4'));
      expect(thirdDeposition.toStakerID).to.be.bignumber.equal(secondStakerID);

      oldDeposition = await getDeposition(thirdDepositor, thirdStakerID);
      expect(oldDeposition.createdEpoch).to.be.bignumber.equal(new BN ('0'));
      expect(oldDeposition.deactivatedEpoch).to.be.bignumber.equal(new BN ('0'));
      expect(oldDeposition.deactivatedTime).to.be.bignumber.equal(new BN ('0'));
      expect(oldDeposition.amount).to.be.bignumber.equal(new BN ('0'));
      expect(oldDeposition.paidUntilEpoch).to.be.bignumber.equal(new BN ('0'));
      expect(oldDeposition.toStakerID).to.be.bignumber.equal(new BN ('0'));
    });
  });
});