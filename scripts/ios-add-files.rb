# Coloca no projeto do Xcode o GoogleService-Info.plist, o som pedido.wav e o App.entitlements.
# Roda no Mac do Codemagic (a gem xcodeproj já vem instalada com o CocoaPods):
#   ruby scripts/ios-add-files.rb
require 'xcodeproj'

project_path = 'ios/App/App.xcodeproj'
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == 'App' } or abort('Target App não encontrado')
group = project.main_group['App'] || project.main_group

%w[GoogleService-Info.plist pedido.wav].each do |name|
  path = File.join('ios/App/App', name)
  next unless File.exist?(path)
  next if group.files.any? { |f| f.path == name }

  ref = group.new_reference(name)
  target.resources_build_phase.add_file_reference(ref, true)
  puts "✓ #{name} adicionado ao projeto"
end

unless group.files.any? { |f| f.path == 'App.entitlements' }
  group.new_reference('App.entitlements')
end

target.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
end

project.save
puts '✓ entitlements de push ligados'
