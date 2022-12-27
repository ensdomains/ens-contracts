default: help

PATCH         = applyHarness.patch
CONTRACTS_DIR = ../contracts
MUNGED_DIR    = munged
NameWrapper_Origin = ../contracts/wrapper/NameWrapper.sol
UpgradeMock_Origin = ../contracts/wrapper/mocks/UpgradedNameWrapperMock.sol
NameWrapper_munged = ./munged/NameWrapper.sol
UpgradeMock_munged = ./munged/UpgradedNameWrapperMock.sol

help:
	@echo "usage:"
	@echo "  make clean:  remove all generated files (those ignored by git)"
	@echo "  make $(MUNGED_DIR): create $(MUNGED_DIR) directory by applying the patch file to $(CONTRACTS_DIR)"
	@echo "  make record: record a new patch file capturing the differences between $(CONTRACTS_DIR) and $(MUNGED_DIR)"

munged:  $(wildcard $(CONTRACTS_DIR)/*.sol) $(PATCH)
	rm -rf $@
	cp -r $(CONTRACTS_DIR) $@
	patch -p0 -d $@ < $(PATCH)

record:
	diff -ruN $(NameWrapper_Origin) $(NameWrapper_munged) | sed 's+\$(NameWrapper_Origin)/++g' | sed 's+$(NameWrapper_munged)++g' > $(PATCH)
	diff -ruN $(UpgradeMock_Origin) $(UpgradeMock_munged) | sed 's+\$(UpgradeMock_Origin)/++g' | sed 's+$(NameWrapper_munged)++g' >> $(PATCH)

clean:
	git clean -fdX
	touch $(PATCH)