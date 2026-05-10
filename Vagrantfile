Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-24.04"

  # Disable the default /vagrant synced folder
  config.vm.synced_folder ".", "/vagrant", disabled: true

  # Synced folders
  config.vm.synced_folder "/Users/matthewcasperson/Code/OctoAIChromeExtension/dashboards/spinnaker", "/home/vagrant/Code/OctoAIChromeExtension/dashboards/spinnaker"
  config.vm.synced_folder "/Users/matthewcasperson/Code/OctopusCopilot/context", "/home/vagrant/Code/OctopusCopilot/context"
  config.vm.synced_folder "/Users/matthewcasperson/Downloads/spinnaker-pipelines-vendor-anonymized", "/home/vagrant/Downloads/spinnaker-pipelines-vendor-anonymized"

  config.vm.provider "parallels" do |prl|
    prl.memory = 4096
    prl.cpus   = 2
  end

  # Pass the GitHub Copilot token from the host environment into the VM
  config.vm.provision "shell", run: "always", inline: <<-SHELL
    echo "export GH_TOKEN='#{ENV['GITHUB_COPILOT_TOKEN']}'" > /etc/profile.d/github_copilot_token.sh
    chmod 600 /etc/profile.d/github_copilot_token.sh
  SHELL

  config.vm.provision "shell", inline: <<-SHELL
    set -euo pipefail

    apt-get update -y

    # ── Base tools ──────────────────────────────────────────────────────────────
    apt-get install -y \
      curl \
      git \
      jq \
      docker.io

    # ── Node.js (LTS via NodeSource) ────────────────────────────────────────────
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y nodejs

    # ── GitHub Copilot CLI ─────────────────────────────────────────────────────
    npm install -g @github/copilot

    # ── GitHub CLI ──────────────────────────────────────────────────────────────
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt-get update -y
    apt-get install -y gh

    # ── Disable bash history for this provisioning session ─────────────────────────────────
    echo "set +o history" >> ~/.bash_profile

    echo "──────────────────────────────────────"
    echo "git     : $(git --version)"
    echo "jq      : $(jq --version)"
    echo "curl    : $(curl --version | head -1)"
    echo "node    : $(node --version)"
    echo "npm     : $(npm --version)"
    echo "gh      : $(gh --version | head -1)"
    echo "──────────────────────────────────────"
  SHELL
end

